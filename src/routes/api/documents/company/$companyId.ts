import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments } from "@/db/schema/compliance";
import { toApiDoc } from "@/lib/document-api";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/documents/company/$companyId")({
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

        const docs = await (
          db.select().from(complianceDocuments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
        )(eq(complianceDocuments.companyId, companyId));
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return new Response(JSON.stringify(docs.map(toApiDoc)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
