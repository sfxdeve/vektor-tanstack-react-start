import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { eq } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/request/$paymentId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
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
        if (payment.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "Not your payment" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        if (payment.status !== "awaiting_proof" && payment.status !== "pending_review") {
          return new Response(
            JSON.stringify({ detail: `Cannot cancel a ${payment.status} payment` }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        if (payment.proofPath && storage) {
          try {
            await storage.delete(payment.proofPath);
          } catch {
            // ignore
          }
        }

        await (db.delete(eftPayments).where as unknown as (c: unknown) => Promise<unknown>)(
          eq(eftPayments.id, paymentId),
        );

        return new Response(JSON.stringify({ status: "cancelled", id: paymentId }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
