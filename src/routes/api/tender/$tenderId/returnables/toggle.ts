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

export const Route = createFileRoute("/api/tender/$tenderId/returnables/toggle")({
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
          const exists = await (
            db.select().from(tenders).where as unknown as (
              c: unknown,
            ) => Promise<(typeof tenders.$inferSelect)[]>
          )(eq(tenders.id, tenderId));
          if (exists[0] && !isAdmin) {
            return new Response(
              JSON.stringify({ detail: "You don't have access to this tender" }),
              {
                status: 403,
                headers: { "content-type": "application/json" },
              },
            );
          }
          return new Response(JSON.stringify({ detail: "Tender not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const returnableName = (body.returnable_name ?? body.returnableName ?? "") as string;
        const verified = Boolean(body.verified);

        if (!returnableName) {
          return new Response(JSON.stringify({ detail: "returnable_name is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const parsed: string[] = tender.parsedReturnables
          ? JSON.parse(tender.parsedReturnables)
          : [];
        if (!parsed.includes(returnableName)) {
          return new Response(JSON.stringify({ detail: "Unknown returnable for this tender" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const currentStatus: Record<
          string,
          { verified: boolean; verified_at: string | null; doc_ref: string | null }
        > = tender.returnableStatus ? JSON.parse(tender.returnableStatus) : {};

        const existing = currentStatus[returnableName] ?? {
          verified: false,
          verified_at: null,
          doc_ref: null,
        };
        currentStatus[returnableName] = {
          verified,
          verified_at: verified ? new Date().toISOString() : null,
          doc_ref: existing.doc_ref ?? null,
        };

        const now = new Date();
        await (
          db.update(tenders).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({
          returnableStatus: JSON.stringify(currentStatus),
          updatedAt: now,
        }).where(eq(tenders.id, tenderId));

        return new Response(JSON.stringify({ returnable_status: currentStatus }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
