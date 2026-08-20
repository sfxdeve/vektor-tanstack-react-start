import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";

const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { getSessionFromRequest } from "@/lib/server-auth";

function toApi(payment: typeof eftPayments.$inferSelect) {
  return {
    id: payment.id,
    reference: payment.reference,
    user_id: payment.userId,
    user_email: payment.userEmail,
    company_id: payment.companyId,
    company_name: payment.companyName,
    lookup_key: payment.lookupKey,
    package_name: payment.packageName,
    amount: payment.amount / 100,
    amount_cents: payment.amount,
    credits: payment.credits,
    annual_credits: payment.annualCredits,
    billing_period: payment.billingPeriod,
    type: payment.type,
    status: payment.status,
    proof_path: payment.proofPath,
    proof_content_type: payment.proofContentType,
    proof_filename: payment.proofFilename,
    reject_reason: payment.rejectReason,
    created_at: new Date(payment.createdAt).toISOString(),
    updated_at: new Date(payment.updatedAt).toISOString(),
    confirmed_at: payment.confirmedAt ? new Date(payment.confirmedAt).toISOString() : null,
    rejected_at: payment.rejectedAt ? new Date(payment.rejectedAt).toISOString() : null,
    credits_granted: payment.creditsGranted,
  };
}

export const Route = createFileRoute("/api/eft/admin/$paymentId/confirm")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const paymentId = (params as Record<string, string>).paymentId;
        const db = createDb(env.DB as unknown as D1Database);

        const rows = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId));
        const payment = rows[0];
        if (!payment) {
          return new Response(JSON.stringify({ detail: "Payment not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (payment.status === "confirmed") {
          return new Response(JSON.stringify({ detail: "Payment already confirmed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (payment.status !== "pending_review") {
          return new Response(
            JSON.stringify({
              detail: `Payment must be in pending_review, currently ${payment.status}`,
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const creditsToAdd =
          payment.billingPeriod === "annual" && payment.annualCredits
            ? payment.annualCredits
            : payment.credits;

        // Grant credits atomically (read + update)
        const creditRows = await (
          db.select().from(companyCredits).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companyCredits.$inferSelect)[]>
        )(eq(companyCredits.companyId, payment.companyId));
        const existing = creditRows[0];
        const current = existing?.credits ?? 0;
        const now = new Date();

        if (existing) {
          await (
            db.update(companyCredits).set as unknown as (v: unknown) => {
              where: (c: unknown) => Promise<unknown>;
            }
          )({ credits: current + creditsToAdd, updatedAt: now }).where(
            eq(companyCredits.companyId, payment.companyId),
          );
        } else {
          await db.insert(companyCredits).values({
            companyId: payment.companyId,
            credits: creditsToAdd,
            updatedAt: now,
          });
        }

        await (
          db.update(eftPayments).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({
          status: "confirmed",
          confirmedAt: now,
          confirmedBy: session.user.id,
          creditsGranted: creditsToAdd,
          updatedAt: now,
        }).where(eq(eftPayments.id, paymentId));

        // Best-effort referral reward hook (issue 07) — if referrals tables exist, attempt
        // We don't fail confirmation if referral logic errors
        try {
          // Dynamic import to avoid hard dependency if referrals module not yet implemented
          const mod = await import("@/lib/referral").catch(() => null);
          const maybeReward = (
            mod as unknown as {
              maybeRewardReferrerOnPaidEft?: (...a: unknown[]) => Promise<unknown>;
            }
          )?.maybeRewardReferrerOnPaidEft;
          if (typeof maybeReward === "function") {
            const isSub = payment.type === "subscription";
            await maybeReward(db as unknown as never, {
              refereeUserId: payment.userId,
              isSubscription: isSub,
              triggerReference: payment.reference,
              planLookupKey: payment.lookupKey,
            });
          }
        } catch {
          // ignore referral errors
        }

        const updated = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId)).then((r) => r[0]!);

        return new Response(JSON.stringify(toApi(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
