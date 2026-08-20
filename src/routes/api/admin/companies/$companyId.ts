// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { referralRewards } from "@/db/schema/referral";
import { tenders } from "@/db/schema/tender";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/admin/companies/$companyId")({
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
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);
        const allCompanies = await db.select().from(companies);
        const target = allCompanies.find((c) => c.id === companyId) as
          | typeof companies.$inferSelect
          | undefined;
        if (!target) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const allDocs = await db.select().from(complianceDocuments);
        const docs = allDocs.filter(
          (d) => (d as unknown as { companyId: string }).companyId === companyId,
        );
        const allTenders = await db.select().from(tenders);
        const companyTenders = allTenders.filter(
          (t) => (t as unknown as { companyId: string }).companyId === companyId,
        );
        const allCredits = await db.select().from(companyCredits);
        const credits = allCredits.find(
          (cc) => (cc as unknown as { companyId: string }).companyId === companyId,
        );
        const allReminders = await db.select().from(sentReminders);
        const reminders = allReminders.filter(
          (r) => (r as unknown as { companyId: string }).companyId === companyId,
        );
        const allEft = await db.select().from(eftPayments);
        const eft = allEft.filter(
          (p) => (p as unknown as { companyId: string }).companyId === companyId,
        );

        const now = Date.now();
        const expired = docs.filter((d) => {
          const expiry = (d as unknown as { expiryDate?: unknown }).expiryDate;
          if (!expiry) return false;
          return new Date(expiry as string | Date).getTime() < now;
        }).length;

        return new Response(
          JSON.stringify({
            company: {
              id: target.id,
              company_name: (target as unknown as { companyName: string }).companyName,
              companyName: (target as unknown as { companyName: string }).companyName,
              cipc_num: (target as unknown as { cipcNum: string }).cipcNum,
              user_id: (target as unknown as { userId: string }).userId,
              bbbee_level: (target as unknown as { bbbeeLevel?: number }).bbbeeLevel ?? null,
              cidb_crs_num: (target as unknown as { cidbCrsNum?: string }).cidbCrsNum ?? null,
              created_at: new Date(
                (target as unknown as { createdAt: Date }).createdAt,
              ).toISOString(),
            },
            docs: docs.map((d) => ({
              id: (d as unknown as { id: string }).id,
              doc_type: (d as unknown as { docType: string }).docType,
              file_name: (d as unknown as { fileName: string }).fileName,
              is_compliant: (d as unknown as { isCompliant: boolean }).isCompliant,
              expiry_date: (d as unknown as { expiryDate?: unknown }).expiryDate
                ? new Date((d as unknown as { expiryDate: Date }).expiryDate).toISOString()
                : null,
              storage_key: (d as unknown as { storageKey?: string }).storageKey ?? null,
            })),
            tenders: companyTenders.map((t) => ({
              id: (t as unknown as { id: string }).id,
              title: (t as unknown as { title: string }).title,
              fit_score: (t as unknown as { fitScore: number }).fitScore,
              created_at: new Date((t as unknown as { createdAt: Date }).createdAt).toISOString(),
            })),
            credits: credits ? (credits as unknown as { credits: number }).credits : 0,
            reminders: reminders.map((r) => ({
              id: (r as unknown as { id: string }).id,
              threshold: (r as unknown as { threshold: number }).threshold,
              sent_at: new Date((r as unknown as { sentAt: Date }).sentAt).toISOString(),
            })),
            eft: eft.map((p) => ({
              id: (p as unknown as { id: string }).id,
              reference: (p as unknown as { reference: string }).reference,
              status: (p as unknown as { status: string }).status,
            })),
            compliance: {
              total: docs.length,
              expired,
              compliant: docs.filter((d) => (d as unknown as { isCompliant: boolean }).isCompliant)
                .length,
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
      DELETE: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);
        const allCompanies = await db.select().from(companies);
        const target = allCompanies.find((c) => c.id === companyId) as
          | typeof companies.$inferSelect
          | undefined;
        if (!target) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;

        // Collect docs and tenders for R2 deletion and counts
        const allDocs = await db.select().from(complianceDocuments);
        const docs = allDocs.filter(
          (d) => (d as unknown as { companyId: string }).companyId === companyId,
        );
        const allTenders = await db.select().from(tenders);
        const tRows = allTenders.filter(
          (t) => (t as unknown as { companyId: string }).companyId === companyId,
        );

        for (const d of docs) {
          const key = (d as unknown as { storageKey?: string }).storageKey;
          if (key && storage) {
            try {
              await storage.delete(key);
            } catch {
              // ignore
            }
          }
        }
        for (const t of tRows) {
          const key = (t as unknown as { pdfStorageKey?: string }).pdfStorageKey;
          if (key && storage) {
            try {
              await storage.delete(key);
            } catch {
              // ignore
            }
          }
        }

        // Also need to clean EFT proof keys for this company? But eft proof deletion not needed for company delete? Keep.

        const docCount = docs.length;
        const tenderCount = tRows.length;

        // Delete in correct order due to FK
        for (const d of docs) {
          try {
            await (
              db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>
            )(eq(complianceDocuments.id, (d as unknown as { id: string }).id));
          } catch {
            // ignore
          }
        }
        for (const t of tRows) {
          try {
            await (db.delete(tenders).where as unknown as (c: unknown) => Promise<unknown>)(
              eq(tenders.id, (t as unknown as { id: string }).id),
            );
          } catch {
            // ignore
          }
        }
        // Delete sent_reminders
        for (const r of await db.select().from(sentReminders)) {
          if ((r as unknown as { companyId: string }).companyId === companyId) {
            try {
              await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(sentReminders.id, (r as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete company credits
        for (const cc of await db.select().from(companyCredits)) {
          if ((cc as unknown as { companyId: string }).companyId === companyId) {
            try {
              await (
                db.delete(companyCredits).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(companyCredits.companyId, companyId));
            } catch {
              // ignore
            }
          }
        }
        // Delete eft payments for this company (cascade note: but explicitly for count)
        for (const p of await db.select().from(eftPayments)) {
          if ((p as unknown as { companyId: string }).companyId === companyId) {
            const key = (p as unknown as { proofPath?: string }).proofPath;
            if (key && storage) {
              try {
                await storage.delete(key);
              } catch {
                // ignore
              }
            }
            try {
              await (db.delete(eftPayments).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(eftPayments.id, (p as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete referral rewards referencing this company
        for (const rr of await db.select().from(referralRewards)) {
          if ((rr as unknown as { referrerCompanyId: string }).referrerCompanyId === companyId) {
            try {
              await (
                db.delete(referralRewards).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(referralRewards.id, (rr as unknown as { id: string }).id));
            } catch {
              // ignore
            }
          }
        }

        // Finally delete company
        try {
          await (db.delete(companies).where as unknown as (c: unknown) => Promise<unknown>)(
            eq(companies.id, companyId),
          );
        } catch {
          return new Response(JSON.stringify({ detail: "Failed to delete company" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            status: "deleted",
            id: companyId,
            cascaded: { documents: docCount, tenders: tenderCount },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
