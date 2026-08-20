import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import {
  DOC_TYPES,
  extractBbbeeLevelFromBytes,
  extractExpiryFromBytes,
  VALID_DOC_TYPES,
  validateBargainingCouncil,
} from "@/lib/compliance";

async function getSession(request: Request) {
  const { createAuth } = await import("@/lib/auth/auth");
  const auth = createAuth(env.DB as unknown as D1Database);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

function toApiDoc(row: typeof complianceDocuments.$inferSelect) {
  const expiry = row.expiryDate ? new Date(row.expiryDate).toISOString().slice(0, 10) : null;
  const extractedExpiry = row.extractedExpiryDate
    ? new Date(row.extractedExpiryDate).toISOString().slice(0, 10)
    : null;
  return {
    id: row.id,
    company_id: row.companyId,
    doc_type: row.docType,
    file_name: row.fileName,
    expiry_date: expiry,
    is_compliant: Boolean(row.isCompliant),
    storage_path: row.storageKey,
    storage_key: row.storageKey,
    bargaining_council: row.bargainingCouncil ?? null,
    extracted_bbbee_level: row.extractedBbbeeLevel ?? null,
    extracted_expiry_date: extractedExpiry,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

function parseIsCompliant(raw: FormDataEntryValue | null): boolean {
  if (raw == null) return true;
  if (typeof raw !== "string") return true;
  const s = raw.toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  return true;
}

export const Route = createFileRoute("/api/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const formData = await request.formData().catch(() => null);
        if (!formData) {
          return new Response(JSON.stringify({ detail: "Invalid form data" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const file = formData.get("file") as File | null;
        const companyId = (formData.get("company_id") ?? formData.get("companyId") ?? "") as string;
        const docTypeRaw = (formData.get("doc_type") ?? formData.get("docType") ?? "") as string;
        const expiryRaw = (formData.get("expiry_date") ??
          formData.get("expiryDate") ??
          "") as string;
        const isCompliantRaw = formData.get("is_compliant") ?? formData.get("isCompliant");
        const bargainingCouncilRaw = (formData.get("bargaining_council") ??
          formData.get("bargainingCouncil") ??
          null) as string | null;

        if (!file || typeof file.arrayBuffer !== "function" || !file.name) {
          return new Response(JSON.stringify({ detail: "File is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!companyId) {
          return new Response(JSON.stringify({ detail: "company_id is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!docTypeRaw) {
          return new Response(JSON.stringify({ detail: "doc_type is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const docType = String(docTypeRaw).trim().toUpperCase();
        if (!VALID_DOC_TYPES.has(docType)) {
          return new Response(
            JSON.stringify({
              detail: `Invalid doc_type: ${docType}. Must be one of ${DOC_TYPES.join(", ")}`,
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        if (!expiryRaw || String(expiryRaw).trim() === "") {
          return new Response(JSON.stringify({ detail: "expiry_date is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const expiryStr = String(expiryRaw).trim();
        const expiryDate = new Date(expiryStr);
        if (Number.isNaN(expiryDate.getTime())) {
          return new Response(JSON.stringify({ detail: "Invalid expiry_date format" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const isCompliant = parseIsCompliant(isCompliantRaw as FormDataEntryValue | null);

        let bcCode: string | null = null;
        try {
          bcCode = validateBargainingCouncil(docType, bargainingCouncilRaw);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid bargaining council";
          return new Response(JSON.stringify({ detail: msg }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);

        // Ownership check
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
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin && company.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        // Read file bytes
        let bytes: Uint8Array;
        try {
          const buf = await file.arrayBuffer();
          bytes = new Uint8Array(buf);
        } catch {
          return new Response(JSON.stringify({ detail: "Failed to read file" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const fileName = file.name;
        const contentType = file.type || "application/octet-stream";
        const isPdf = contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

        let extractedLevel: number | null = null;
        let extractedExpiryIso: string | null = null;
        if (isPdf && ["BBBEE", "COIDA", "TAX_PIN", "BARGAINING_COUNCIL_GOS"].includes(docType)) {
          extractedExpiryIso = extractExpiryFromBytes(bytes);
        }
        if (isPdf && docType === "BBBEE") {
          extractedLevel = extractBbbeeLevelFromBytes(bytes);
        }
        let extractedExpiryDate: Date | null = null;
        if (extractedExpiryIso) {
          const d = new Date(extractedExpiryIso);
          if (!Number.isNaN(d.getTime())) extractedExpiryDate = d;
        }

        // Storage put
        const docId = crypto.randomUUID();
        const storageKey = `compliance/${companyId}/${docId}`;
        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        if (storage) {
          try {
            await storage.put(storageKey, bytes, {
              httpMetadata: { contentType },
            });
          } catch (e) {
            console.error("R2 put failed", e);
            return new Response(JSON.stringify({ detail: "File storage failed" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
        } else {
          // In unit tests without R2, skip storage
          console.warn("STORAGE binding not available, skipping R2 put");
        }

        // Purge superseded docs of same type (and same council for BC)
        // Must remove R2 objects and sent_reminders rows.
        // Fetch all for company and filter in JS to avoid drizzle `and` typing complexity.
        let toPurge: (typeof complianceDocuments.$inferSelect)[] = [];
        try {
          const all = await (
            db.select().from(complianceDocuments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
          )(eq(complianceDocuments.companyId, companyId));
          toPurge = all.filter((r) => {
            if (r.docType !== docType) return false;
            if (docType === "BARGAINING_COUNCIL_GOS") return r.bargainingCouncil === bcCode;
            return true;
          });
        } catch {
          toPurge = [];
        }

        for (const old of toPurge) {
          if (old.storageKey && storage) {
            try {
              await storage.delete(old.storageKey);
            } catch (e) {
              console.warn("R2 delete failed for superseded", old.storageKey, e);
            }
          }
          // Clear sent_reminders for this document
          try {
            await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
              eq(sentReminders.documentId, old.id),
            );
          } catch (e) {
            console.warn("Failed to delete sent_reminders for superseded", old.id, e);
          }
        }
        if (toPurge.length > 0) {
          try {
            const ids = toPurge.map((d) => d.id);
            // Drizzle delete where id in list — use loop for simplicity
            for (const pid of ids) {
              await (
                db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(complianceDocuments.id, pid));
            }
          } catch (e) {
            console.warn("Failed to delete superseded compliance_documents", e);
          }
        }

        const now = new Date();
        const row = {
          id: docId,
          companyId,
          docType: docType as typeof complianceDocuments.$inferSelect.docType,
          fileName,
          storageKey,
          expiryDate,
          isCompliant,
          bargainingCouncil: bcCode,
          extractedBbbeeLevel: extractedLevel,
          extractedExpiryDate,
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(complianceDocuments).values(row);

        const createdRows = await (
          db.select().from(complianceDocuments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
        )(eq(complianceDocuments.id, docId));
        const created = createdRows[0]!;
        return new Response(JSON.stringify(toApiDoc(created)), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
