import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { eq, toApiEftPayment } from "@/lib/eft-api";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/eft/admin/all")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const url = new URL(request.url);
        const statusFilter = url.searchParams.get("status");

        const db = createDb(env.DB as unknown as D1Database);
        let rows: (typeof eftPayments.$inferSelect)[];
        if (statusFilter) {
          rows = await (
            db.select().from(eftPayments).where as unknown as (c: unknown) => Promise<(typeof eftPayments.$inferSelect)[]>
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
