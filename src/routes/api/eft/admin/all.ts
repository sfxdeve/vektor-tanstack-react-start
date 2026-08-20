import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { eq, toApiEftPayment } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/all")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
        const url = new URL(request.url);
        const statusFilter = url.searchParams.get("status");

        const db = createDb(env.DB as unknown as D1Database);
        let rows: (typeof eftPayments.$inferSelect)[];
        if (statusFilter) {
          rows = await (
            db.select().from(eftPayments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof eftPayments.$inferSelect)[]>
          )(eq(eftPayments.status, statusFilter));
        } else {
          rows = await db.select().from(eftPayments);
        }
        rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return new Response(JSON.stringify({ payments: rows.map(toApiEftPayment) }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
