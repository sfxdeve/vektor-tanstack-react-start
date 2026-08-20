import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { tenders } from "@/db/schema/tender";
import { toApiTender } from "@/lib/tender-helpers";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/tenders/$companyId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const companyId = (params as Record<string, string>).companyId;
        if (!companyId) {
          return new Response(JSON.stringify({ detail: "companyId required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        const companyRows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const company = companyRows[0];
        if (!company) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (!isAdmin && company.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const rows = await (
          db.select().from(tenders).where as unknown as (
            c: unknown,
          ) => Promise<(typeof tenders.$inferSelect)[]>
        )(eq(tenders.companyId, companyId));
        rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const data = rows.map(toApiTender);
        return new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
