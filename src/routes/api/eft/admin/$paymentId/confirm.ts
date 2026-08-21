import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { canTransition, eq, toApiEftPayment } from "@/lib/eft-api";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/eft/admin/$paymentId/confirm")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;
        const session = adminCheck;
        const paymentId = (params as Record<string, string>).paymentId;
        const db = createDb(env.DB as unknown as D1Database);

        const rows = await (
          db.select().from(eftPayments).where as unknown as (c: unknown) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId));
        const payment = rows[0];
        if (!payment) {
          return new Response(JSON.stringify({ detail: "Payment not found" }), { status: 404, headers: { "content-type": "application/json" } });
        }
        // Idempotent: if already confirmed, return 200 with current state (spec: confirm idempotently granting credits)
        if (payment.status === "confirmed") {
          return new Response(JSON.stringify(toApiEftPayment(payment)), {
            headers: { "content-type": "application/json" },
          });
        }
        if (!canTransition(payment.status as never, "confirmed")) {
          return new Response(JSON.stringify({ detail: `Payment must be in pending_review, currently ${payment.status}` }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const creditsToAdd = payment.billingPeriod === "annual" && payment.annualCredits ? payment.annualCredits : payment.credits;

        const creditRows = await (
          db.select().from(companyCredits).where as unknown as (c: unknown) => Promise<(typeof companyCredits.$inferSelect)[]>
        )(eq(companyCredits.companyId, payment.companyId));
        const existing = creditRows[0];
        const current = existing?.credits ?? 0;
        const now = new Date();

        if (existing) {
          await (
            db.update(companyCredits).set as unknown as (v: unknown) => { where: (c: unknown) => Promise<unknown> }
          )({ credits: current + creditsToAdd, updatedAt: now }).where(eq(companyCredits.companyId, payment.companyId));
        } else {
          await db.insert(companyCredits).values({ companyId: payment.companyId, credits: creditsToAdd, updatedAt: now });
        }

        await (
          db.update(eftPayments).set as unknown as (v: unknown) => { where: (c: unknown) => Promise<unknown> }
        )({
          status: "confirmed",
          confirmedAt: now,
          confirmedBy: (session! as unknown as { user: { id: string } }).user.id,
          creditsGranted: creditsToAdd,
          updatedAt: now,
        }).where(eq(eftPayments.id, paymentId));

        try {
          const mod = await import("@/lib/referral").catch(() => null);
          const maybeReward = (mod as unknown as { maybeRewardReferrerOnPaidEft?: (...a: unknown[]) => Promise<unknown> })?.maybeRewardReferrerOnPaidEft;
          if (typeof maybeReward === "function") {
            const isSub = payment.type === "subscription";
            await maybeReward(db as unknown as never, {
              refereeUserId: payment.userId,
              isSubscription: isSub,
              triggerReference: payment.reference,
              planLookupKey: payment.lookupKey,
            });
          }
        } catch {}

        const updated = await (
          db.select().from(eftPayments).where as unknown as (c: unknown) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId)).then((r) => r[0]!);

        return new Response(JSON.stringify(toApiEftPayment(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
