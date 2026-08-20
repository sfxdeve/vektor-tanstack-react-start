import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";

const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/billing/credits/$companyId")({
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

        const rows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const company = rows[0];
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

        const creditRows = await (
          db.select().from(companyCredits).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companyCredits.$inferSelect)[]>
        )(eq(companyCredits.companyId, companyId));
        const creditRow = creditRows[0];
        const credits = creditRow?.credits ?? 0;

        // subscription info isn't persisted yet beyond credits; return minimal
        return new Response(
          JSON.stringify({
            company_id: companyId,
            credits,
            subscription: null,
            updated_at: creditRow?.updatedAt ? new Date(creditRow.updatedAt).toISOString() : null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
