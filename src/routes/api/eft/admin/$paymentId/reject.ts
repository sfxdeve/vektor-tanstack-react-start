import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { toApiEftPayment } from "@/lib/eft-api";
import { requireAdmin } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/eft/admin/$paymentId/reject")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const reason = asString(body?.reason ?? "").trim();
        if (!reason) {
          return Response.json({ detail: "Rejection reason is required" }, { status: 400 });
        }

        const db = createDb(env.DB);
        const rows = await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.id, params.paymentId));
        const payment = rows[0];
        if (!payment) return Response.json({ detail: "Payment not found" }, { status: 404 });
        if (payment.status === "confirmed") {
          return Response.json(
            { detail: "Cannot reject a confirmed payment. Refund manually and delete the record." },
            { status: 400 },
          );
        }
        if (payment.status !== "pending_review" && payment.status !== "awaiting_proof") {
          return Response.json(
            { detail: `Cannot reject a ${payment.status} payment` },
            { status: 400 },
          );
        }

        const now = new Date();
        await db
          .update(eftPayments)
          .set({
            status: "rejected",
            rejectReason: reason,
            rejectedAt: now,
            rejectedBy: adminCheck.user.id,
            updatedAt: now,
          })
          .where(eq(eftPayments.id, params.paymentId));

        const updated = (
          await db.select().from(eftPayments).where(eq(eftPayments.id, params.paymentId))
        )[0]!;
        return Response.json(toApiEftPayment(updated));
      },
    },
  },
});
