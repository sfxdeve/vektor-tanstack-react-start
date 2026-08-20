import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { canTransition, eq, toApiEftPayment } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/$paymentId/reject")({
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

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const reasonRaw = (body.reason ?? body.reject_reason ?? "") as string;
        const reason = reasonRaw.trim();
        if (!reason) {
          return new Response(JSON.stringify({ detail: "Rejection reason is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

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
          return new Response(
            JSON.stringify({
              detail: "Cannot reject a confirmed payment. Refund manually and delete the record.",
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        if (!canTransition(payment.status as never, "rejected")) {
          return new Response(
            JSON.stringify({ detail: `Cannot reject a ${payment.status} payment` }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const now = new Date();
        await (
          db.update(eftPayments).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({
          status: "rejected",
          rejectReason: reason,
          rejectedAt: now,
          rejectedBy: session.user.id,
          updatedAt: now,
        }).where(eq(eftPayments.id, paymentId));

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
