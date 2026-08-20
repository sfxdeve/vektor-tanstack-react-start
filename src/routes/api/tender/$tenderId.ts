import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { tenders } from "@/db/schema/tender";
import { toApiTender } from "@/lib/tender-helpers";
import { getSessionFromRequest } from "@/lib/server-auth";

async function fetchOwnedTender(
  db: ReturnType<typeof createDb>,
  tenderId: string,
  userId: string,
  isAdmin: boolean,
) {
  const rows = await (
    db.select().from(tenders).where as unknown as (
      c: unknown,
    ) => Promise<(typeof tenders.$inferSelect)[]>
  )(eq(tenders.id, tenderId));
  const tender = rows[0];
  if (!tender) return null;
  if (isAdmin) return tender;
  const compRows = await (
    db.select().from(companies).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companies.$inferSelect)[]>
  )(eq(companies.id, tender.companyId));
  const company = compRows[0];
  if (!company || company.userId !== userId) return null;
  return tender;
}

export const Route = createFileRoute("/api/tender/$tenderId")({
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
        const tenderId = (params as Record<string, string>).tenderId as string | undefined;
        if (!tenderId) {
          return new Response(JSON.stringify({ detail: "Tender not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        const tender = await fetchOwnedTender(db, tenderId, session.user.id!, isAdmin);
        if (!tender) {
          // Distinguish 404 vs 403: if tender exists but not owned, return 403
          const exists = await (
            db.select().from(tenders).where as unknown as (
              c: unknown,
            ) => Promise<(typeof tenders.$inferSelect)[]>
          )(eq(tenders.id, tenderId));
          if (exists[0] && !isAdmin) {
            const compRows = await (
              db.select().from(companies).where as unknown as (
                c: unknown,
              ) => Promise<(typeof companies.$inferSelect)[]>
            )(eq(companies.id, exists[0].companyId));
            const comp = compRows[0];
            if (!comp || comp.userId !== session.user.id) {
              return new Response(
                JSON.stringify({ detail: "You don't have access to this tender" }),
                {
                  status: 403,
                  headers: { "content-type": "application/json" },
                },
              );
            }
          }
          return new Response(JSON.stringify({ detail: "Tender not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify(toApiTender(tender)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
