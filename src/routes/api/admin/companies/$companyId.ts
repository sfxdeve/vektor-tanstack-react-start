// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { referralRewards } from "@/db/schema/referral";
import { tenders } from "@/db/schema/tender";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/admin/companies/$companyId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);

        const rows = (await db.select().from(companies).where(eq(companies.id, companyId) as unknown as never).catch(async () => (await db.select().from(companies)).filter((c) => c.id === companyId))) as (typeof companies.$inferSelect)[];
        const target = rows[0] ?? (await db.select().from(companies)).find((c) => c.id === companyId) as typeof companies.$inferSelect | undefined;
        if (!target) {
          return new Response(JSON.stringify({ detail: "Company not found" }), { status: 404, headers: { "content-type": "application/json" } });
        }

        const docs = (await db.select().from(complianceDocuments).where(eq(complianceDocuments.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(complianceDocuments)).filter((d) => (d as unknown as { companyId: string }).companyId === companyId))) as (typeof complianceDocuments.$inferSelect)[];
        const companyTenders = (await db.select().from(tenders).where(eq(tenders.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(tenders)).filter((t) => (t as unknown as { companyId: string }).companyId === companyId))) as (typeof tenders.$inferSelect)[];
        const credits = (await db.select().from(companyCredits).where(eq(companyCredits.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(companyCredits)).filter((c) => (c as unknown as { companyId: string }).companyId === companyId))) as (typeof companyCredits.$inferSelect)[];
        const reminders = (await db.select().from(sentReminders).where(eq(sentReminders.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(sentReminders)).filter((r) => (r as unknown as { companyId: string }).companyId === companyId))) as (typeof sentReminders.$inferSelect)[];
        const eft = (await db.select().from(eftPayments).where(eq(eftPayments.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(eftPayments)).filter((p) => (p as unknown as { companyId: string }).companyId === companyId))) as (typeof eftPayments.$inferSelect)[];

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
              created_at: new Date((target as unknown as { createdAt: Date }).createdAt).toISOString(),
            },
            docs: docs.map((d) => ({
              id: (d as unknown as { id: string }).id,
              doc_type: (d as unknown as { docType: string }).docType,
              file_name: (d as unknown as { fileName: string }).fileName,
              is_compliant: (d as unknown as { isCompliant: boolean }).isCompliant,
              expiry_date: (d as unknown as { expiryDate?: unknown }).expiryDate ? new Date((d as unknown as { expiryDate: Date }).expiryDate).toISOString() : null,
              storage_key: (d as unknown as { storageKey?: string }).storageKey ?? null,
            })),
            tenders: companyTenders.map((t) => ({
              id: (t as unknown as { id: string }).id,
              title: (t as unknown as { title: string }).title,
              fit_score: (t as unknown as { fitScore: number }).fitScore,
              created_at: new Date((t as unknown as { createdAt: Date }).createdAt).toISOString(),
            })),
            credits: credits[0] ? (credits[0] as unknown as { credits: number }).credits : 0,
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
            compliance: { total: docs.length, expired, compliant: docs.filter((d) => (d as unknown as { isCompliant: boolean }).isCompliant).length },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
      DELETE: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);
        const rows = (await db.select().from(companies).where(eq(companies.id, companyId) as unknown as never).catch(async () => (await db.select().from(companies)).filter((c) => c.id === companyId))) as (typeof companies.$inferSelect)[];
        const target = rows[0] ?? (await db.select().from(companies)).find((c) => c.id === companyId) as typeof companies.$inferSelect | undefined;
        if (!target) {
          return new Response(JSON.stringify({ detail: "Company not found" }), { status: 404, headers: { "content-type": "application/json" } });
        }

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;

        const docs = (await db.select().from(complianceDocuments).where(eq(complianceDocuments.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(complianceDocuments)).filter((d) => (d as unknown as { companyId: string }).companyId === companyId))) as (typeof complianceDocuments.$inferSelect)[];
        const tRows = (await db.select().from(tenders).where(eq(tenders.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(tenders)).filter((t) => (t as unknown as { companyId: string }).companyId === companyId))) as (typeof tenders.$inferSelect)[];

        for (const d of docs) {
          const key = (d as unknown as { storageKey?: string }).storageKey;
          if (key && storage) { try { await storage.delete(key); } catch {} }
        }
        for (const t of tRows) {
          const key = (t as unknown as { pdfStorageKey?: string }).pdfStorageKey;
          if (key && storage) { try { await storage.delete(key); } catch {} }
        }

        const docCount = docs.length;
        const tenderCount = tRows.length;

        // Bulk deletes with inArray, fallback to loops
        try { await db.delete(complianceDocuments).where(inArray(complianceDocuments.companyId, [companyId]) as unknown as never); } catch { for (const d of docs) { try { await (db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>)(eq(complianceDocuments.id, (d as unknown as { id: string }).id)); } catch {} } }
        try { await db.delete(tenders).where(inArray(tenders.companyId, [companyId]) as unknown as never); } catch { for (const t of tRows) { try { await (db.delete(tenders).where as unknown as (c: unknown) => Promise<unknown>)(eq(tenders.id, (t as unknown as { id: string }).id)); } catch {} } }
        try { await db.delete(sentReminders).where(eq(sentReminders.companyId, companyId) as unknown as never); } catch { for (const r of (await db.select().from(sentReminders)).filter((x) => (x as unknown as { companyId: string }).companyId === companyId)) { try { await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(eq(sentReminders.id, (r as unknown as { id: string }).id)); } catch {} } }
        try { await db.delete(companyCredits).where(eq(companyCredits.companyId, companyId) as unknown as never); } catch {}
        // EFT proofs R2 + delete
        const eftForCompany = (await db.select().from(eftPayments).where(eq(eftPayments.companyId, companyId) as unknown as never).catch(async () => (await db.select().from(eftPayments)).filter((p) => (p as unknown as { companyId: string }).companyId === companyId))) as (typeof eftPayments.$inferSelect)[];
        for (const p of eftForCompany) {
          const key = (p as unknown as { proofPath?: string }).proofPath;
          if (key && storage) { try { await storage.delete(key); } catch {} }
        }
        try { await db.delete(eftPayments).where(eq(eftPayments.companyId, companyId) as unknown as never); } catch { for (const p of eftForCompany) { try { await (db.delete(eftPayments).where as unknown as (c: unknown) => Promise<unknown>)(eq(eftPayments.id, (p as unknown as { id: string }).id)); } catch {} } }
        try { await db.delete(referralRewards).where(eq(referralRewards.referrerCompanyId, companyId) as unknown as never); } catch {}

        try {
          await (db.delete(companies).where as unknown as (c: unknown) => Promise<unknown>)(eq(companies.id, companyId));
        } catch {
          return new Response(JSON.stringify({ detail: "Failed to delete company" }), { status: 500, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({ status: "deleted", id: companyId, cascaded: { documents: docCount, tenders: tenderCount } }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
