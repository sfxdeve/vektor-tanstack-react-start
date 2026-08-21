import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/request/$paymentId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const rows = await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.id, params.paymentId));
        const payment = rows[0];
        if (!payment) return Response.json({ detail: "Payment not found" }, { status: 404 });
        if (payment.userId !== session.user.id) {
          return Response.json({ detail: "Not your payment" }, { status: 403 });
        }
        // Cancellation is only possible while the request is still with the
        // customer (awaiting_proof / pending_review). confirmed and rejected
        // records are part of the audit trail.
        if (payment.status !== "awaiting_proof" && payment.status !== "pending_review") {
          return Response.json(
            { detail: `Cannot cancel a ${payment.status} payment` },
            { status: 400 },
          );
        }

        await db.delete(eftPayments).where(eq(eftPayments.id, params.paymentId));
        return Response.json({ status: "cancelled", id: params.paymentId });
      },
    },
  },
});
