// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { complianceDocuments } from "@/db/schema/compliance";
import { companyCredits } from "@/db/schema/credits";
import { tenders } from "@/db/schema/tender";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/admin/companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || url.searchParams.get("search") || "")
          .trim()
          .toLowerCase();

        const db = createDb(env.DB as unknown as D1Database);
        const companiesRows = await db.select().from(companies);
        const usersRows = await db.select().from(user);
        const docsRows = await db.select().from(complianceDocuments);
        const tendersRows = await db.select().from(tenders);
        const creditsRows = await db.select().from(companyCredits);

        const usersById: Record<string, (typeof usersRows)[number]> = {};
        for (const u of usersRows) usersById[u.id] = u;

        // aggregate docs counts
        const docsByCompany: Record<string, { total: number; expired: number }> = {};
        const now = Date.now();
        for (const d of docsRows) {
          const cid = (d as unknown as { companyId: string }).companyId;
          if (!docsByCompany[cid]) docsByCompany[cid] = { total: 0, expired: 0 };
          docsByCompany[cid].total += 1;
          const expiry = (d as unknown as { expiryDate?: unknown }).expiryDate;
          if (expiry) {
            const t = new Date(expiry as string | Date).getTime();
            if (!Number.isNaN(t) && t < now) docsByCompany[cid].expired += 1;
          }
        }
        const tendersByCompany: Record<string, number> = {};
        for (const t of tendersRows) {
          const cid = (t as unknown as { companyId: string }).companyId;
          tendersByCompany[cid] = (tendersByCompany[cid] ?? 0) + 1;
        }
        const creditsByCompany: Record<string, number> = {};
        for (const cc of creditsRows) {
          const cid = (cc as unknown as { companyId: string }).companyId;
          creditsByCompany[cid] = (cc as unknown as { credits: number }).credits ?? 0;
        }

        let filtered = companiesRows as (typeof companies.$inferSelect)[];
        if (q) {
          filtered = filtered.filter((c) => {
            const name = (
              (c as unknown as { companyName: string }).companyName || ""
            ).toLowerCase();
            const cipc = ((c as unknown as { cipcNum: string }).cipcNum || "").toLowerCase();
            const owner = usersById[(c as unknown as { userId: string }).userId];
            const email = (owner?.email || "").toLowerCase();
            const ownerName = (owner?.name || "").toLowerCase();
            return (
              name.includes(q) || cipc.includes(q) || email.includes(q) || ownerName.includes(q)
            );
          });
        }
        filtered.sort(
          (a, b) =>
            new Date((b as unknown as { createdAt: Date }).createdAt).getTime() -
            new Date((a as unknown as { createdAt: Date }).createdAt).getTime(),
        );

        const result = filtered.map((c) => {
          const cid = c.id;
          const owner = usersById[(c as unknown as { userId: string }).userId];
          return {
            id: cid,
            company_name: (c as unknown as { companyName: string }).companyName,
            companyName: (c as unknown as { companyName: string }).companyName,
            cipc_num: (c as unknown as { cipcNum: string }).cipcNum,
            cipcNum: (c as unknown as { cipcNum: string }).cipcNum,
            csd_maaa_num: (c as unknown as { csdMaaaNum?: string }).csdMaaaNum ?? null,
            sars_tcs_pin: (c as unknown as { sarsTcsPin?: string }).sarsTcsPin ?? null,
            cidb_crs_num: (c as unknown as { cidbCrsNum?: string }).cidbCrsNum ?? null,
            bbbee_level: (c as unknown as { bbbeeLevel?: number }).bbbeeLevel ?? null,
            bbbeeLevel: (c as unknown as { bbbeeLevel?: number }).bbbeeLevel ?? null,
            user_id: (c as unknown as { userId: string }).userId,
            userId: (c as unknown as { userId: string }).userId,
            owner_email: owner?.email ?? null,
            ownerEmail: owner?.email ?? null,
            owner_name: owner?.name ?? null,
            ownerName: owner?.name ?? null,
            credits: creditsByCompany[cid] ?? 0,
            doc_count: docsByCompany[cid]?.total ?? 0,
            expired_doc_count: docsByCompany[cid]?.expired ?? 0,
            tender_count: tendersByCompany[cid] ?? 0,
            alerts_enabled: (c as unknown as { alertsEnabled?: boolean }).alertsEnabled,
            created_at: new Date((c as unknown as { createdAt: Date }).createdAt).toISOString(),
            createdAt: new Date((c as unknown as { createdAt: Date }).createdAt).toISOString(),
            updated_at: new Date((c as unknown as { updatedAt: Date }).updatedAt).toISOString(),
          };
        });

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
