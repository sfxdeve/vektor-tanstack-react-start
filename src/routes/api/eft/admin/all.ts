import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import type { EftStatus } from "@/lib/eft";
import { toApiEftPayment } from "@/lib/eft-api";
import { requireAdmin } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/all")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const url = new URL(request.url);
        const statusFilter = url.searchParams.get("status");

        const db = createDb(env.DB);
        const rows = statusFilter
          ? await db
              .select()
              .from(eftPayments)
              .where(eq(eftPayments.status, statusFilter as EftStatus))
              .orderBy(desc(eftPayments.createdAt))
          : await db.select().from(eftPayments).orderBy(desc(eftPayments.createdAt));
        return Response.json({ payments: rows.map(toApiEftPayment) });
      },
    },
  },
});
