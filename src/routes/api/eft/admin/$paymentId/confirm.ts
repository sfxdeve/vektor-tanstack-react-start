import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";

import { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { toApiEftPayment } from "@/lib/eft-api";
import { maybeRewardReferrerOnPaidEft } from "@/lib/referral";
import { requireAdmin } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/$paymentId/confirm")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const db = createDb(env.DB);
        const rows = await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.id, params.paymentId));
        const payment = rows[0];
        if (!payment) return Response.json({ detail: "Payment not found" }, { status: 404 });

        // Idempotent: re-confirming returns the already-confirmed state.
        if (payment.status === "confirmed") {
          return Response.json(toApiEftPayment(payment));
        }
        if (payment.status !== "pending_review") {
          return Response.json(
            { detail: `Payment must be in pending_review, currently ${payment.status}` },
            { status: 400 },
          );
        }

        // Annual billing grants the full year up-front; otherwise the cycle credits.
        const creditsToAdd =
          payment.billingPeriod === "annual" && payment.annualCredits
            ? payment.annualCredits
            : payment.credits;

        const now = new Date();
        // Atomic grant — the guard inside UPDATE prevents double-grant races.
        await db
          .insert(companyCredits)
          .values({ companyId: payment.companyId, credits: creditsToAdd, updatedAt: now })
          .onConflictDoUpdate({
            target: companyCredits.companyId,
            set: { credits: sql`${companyCredits.credits} + ${creditsToAdd}`, updatedAt: now },
          });

        await db
          .update(eftPayments)
          .set({
            status: "confirmed",
            confirmedAt: now,
            confirmedBy: adminCheck.user.id,
            creditsGranted: creditsToAdd,
            updatedAt: now,
          })
          .where(eq(eftPayments.id, params.paymentId));

        // Referral reward is best-effort and must never fail the confirmation.
        try {
          await maybeRewardReferrerOnPaidEft(db, {
            refereeUserId: payment.userId,
            isSubscription: payment.type === "subscription",
            triggerReference: payment.reference,
            planLookupKey: payment.lookupKey,
          });
        } catch (e) {
          console.error("Failed to process referral reward", e);
        }

        const updated = (
          await db.select().from(eftPayments).where(eq(eftPayments.id, params.paymentId))
        )[0]!;
        return Response.json(toApiEftPayment(updated));
      },
    },
  },
});
