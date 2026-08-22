import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { count, desc, eq, sql } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { complianceDocuments } from "@/db/schema/compliance";
import { companies, type CompanyRow } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { tenders } from "@/db/schema/tender";
import { requireAdmin } from "@/lib/server-auth";

/**
 * Cap on rows returned per request — mirrors the old backend's `.to_list(100)`
 * list caps. The console is a working queue, not an export.
 */
const ADMIN_COMPANIES_LIMIT = 100;

function serializeCompany(
  c: CompanyRow,
  owner: { email: string; name: string } | undefined,
  credits: number,
  docCount: number,
  expiredDocCount: number,
  tenderCount: number,
) {
  return {
    id: c.id,
    company_name: c.companyName,
    cipc_num: c.cipcNum,
    csd_maaa_num: c.csdMaaaNum,
    sars_tcs_pin: c.sarsTcsPin,
    cidb_crs_num: c.cidbCrsNum,
    bbbee_level: c.bbbeeLevel,
    user_id: c.userId,
    owner_email: owner?.email ?? null,
    owner_name: owner?.name ?? null,
    credits,
    doc_count: docCount,
    expired_doc_count: expiredDocCount,
    tender_count: tenderCount,
    alerts_enabled: c.alertsEnabled,
    created_at: new Date(c.createdAt).toISOString(),
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

export const Route = createFileRoute("/api/admin/companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();

        const db = createDb(env.DB);

        const rows = await db
          .select({ company: companies, ownerEmail: user.email, ownerName: user.name })
          .from(companies)
          .leftJoin(user, eq(companies.userId, user.id))
          .orderBy(desc(companies.createdAt))
          .limit(ADMIN_COMPANIES_LIMIT);

        const nowMs = Date.now();
        const docsAgg = await db
          .select({
            companyId: complianceDocuments.companyId,
            total: count(),
            expired: sql<number>`sum(case when ${complianceDocuments.expiryDate} < ${nowMs} then 1 else 0 end)`,
          })
          .from(complianceDocuments)
          .groupBy(complianceDocuments.companyId);
        const tendersAgg = await db
          .select({ companyId: tenders.companyId, n: count() })
          .from(tenders)
          .groupBy(tenders.companyId);
        const creditsAgg = await db
          .select({ companyId: companyCredits.companyId, credits: companyCredits.credits })
          .from(companyCredits);

        const docsByCompany = new Map(
          docsAgg.map((d) => [d.companyId, { total: Number(d.total), expired: Number(d.expired) }]),
        );
        const tendersByCompany = new Map(tendersAgg.map((t) => [t.companyId, Number(t.n)]));
        const creditsByCompany = new Map(creditsAgg.map((c) => [c.companyId, c.credits]));

        const needle = q.toLowerCase();
        const result = rows
          .filter(({ company, ownerEmail, ownerName }) => {
            if (!needle) return true;
            return (
              company.companyName.toLowerCase().includes(needle) ||
              company.cipcNum.toLowerCase().includes(needle) ||
              (ownerEmail ?? "").toLowerCase().includes(needle) ||
              (ownerName ?? "").toLowerCase().includes(needle)
            );
          })
          .map(({ company, ownerEmail, ownerName }) =>
            serializeCompany(
              company,
              ownerEmail ? { email: ownerEmail, name: ownerName ?? "" } : undefined,
              creditsByCompany.get(company.id) ?? 0,
              docsByCompany.get(company.id)?.total ?? 0,
              docsByCompany.get(company.id)?.expired ?? 0,
              tendersByCompany.get(company.id) ?? 0,
            ),
          );

        return Response.json(result);
      },
    },
  },
});
