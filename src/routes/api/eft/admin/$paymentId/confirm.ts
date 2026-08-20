import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { canTransition, eq, toApiEftPayment } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

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
        if (!canTransition(payment.status as never, "confirmed")) {
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

        // Best-effort referral reward (issue 07) — no-op until referrals lands; keep narrow coupling.
        try {
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
          // ignore referral errors — EFT confirmation must succeed even if referral hook fails
        }

        const updated = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId)).then((r) => r[0]!);

        return new Response(JSON.stringify(toApiEftPayment(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
