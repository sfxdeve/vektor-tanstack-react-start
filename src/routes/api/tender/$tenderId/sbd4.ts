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
import { fetchOwnedTender } from "@/lib/tender-auth";
import { generateSbd4 } from "@/lib/sbd";

export const Route = createFileRoute("/api/tender/$tenderId/sbd4")({
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
                { status: 403, headers: { "content-type": "application/json" } },
              );
            }
          }
          return new Response(JSON.stringify({ detail: "Tender not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const compRows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, tender.companyId));
        const company = compRows[0];
        if (!company) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        // Map Drizzle row to SBD input — accept both camel and snake
        const companyForSbd = {
          company_name: company.companyName,
          cipc_num: company.cipcNum,
          csd_maaa_num: company.csdMaaaNum,
          sars_tcs_pin: company.sarsTcsPin,
          cidb_crs_num: company.cidbCrsNum,
          bbbee_level: company.bbbeeLevel,
          authorised_signatory_name: company.authorisedSignatoryName,
          authorised_signatory_position: company.authorisedSignatoryPosition,
        };
        const tenderForSbd = {
          tender_number: tender.tenderNumber,
          title: tender.title,
          issuing_entity: tender.issuingEntity,
          closing_date: tender.closingDate,
        };

        const pdfBytes = await generateSbd4(companyForSbd, tenderForSbd);
        // pdf-lib returns Uint8Array; Response needs ArrayBuffer
        const body = pdfBytes as unknown as Uint8Array<ArrayBuffer>;
        return new Response(body, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="SBD4-${tenderId}.pdf"`,
            "cache-control": "private, max-age=0",
          },
        });
      },
    },
  },
});
