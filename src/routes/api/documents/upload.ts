import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import {
  DOC_TYPES,
  NEEDS_EXPIRY_TYPES,
  type DocType,
  VALID_DOC_TYPES,
  extractBbbeeLevelFromText,
  extractExpiryFromText,
  extractTextFromPdfBytes,
  isBcGos,
  validateBargainingCouncil,
} from "@/lib/compliance";
import { toApiDoc } from "@/lib/document-api";
import { fetchOwnedCompany } from "@/lib/ownership";
import { asString } from "@/lib/request-utils";
import { requireUser } from "@/lib/server-auth";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;
        const formData = await request.formData().catch(() => null);
        if (!formData) return Response.json({ detail: "Invalid form data" }, { status: 400 });

        const file = formData.get("file");
        const companyId = asString(formData.get("company_id"));
        const docType = asString(formData.get("doc_type")).trim().toUpperCase();
        const expiryRaw = asString(formData.get("expiry_date")).trim();
        const complianceValue = formData.get("is_compliant");
        const isCompliant =
          typeof complianceValue === "string"
            ? !["false", "0", "no"].includes(complianceValue.toLowerCase())
            : true;
        const councilValue = formData.get("bargaining_council");

        if (!(file instanceof File) || !file.name)
          return Response.json({ detail: "File is required" }, { status: 400 });
        if (file.size === 0)
          return Response.json({ detail: "Uploaded file is empty" }, { status: 400 });
        if (file.size > MAX_DOCUMENT_BYTES) {
          return Response.json({ detail: "Document is too large (max 10MB)" }, { status: 400 });
        }
        if (!companyId) return Response.json({ detail: "company_id is required" }, { status: 400 });
        if (!VALID_DOC_TYPES.has(docType)) {
          return Response.json(
            { detail: `Invalid doc_type. Must be one of ${DOC_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        const needsExpiry = NEEDS_EXPIRY_TYPES.has(docType as DocType);
        let expiryDate: Date | null = null;
        if (expiryRaw) {
          const parsed = new Date(expiryRaw);
          if (Number.isNaN(parsed.getTime())) {
            return Response.json({ detail: "Invalid expiry_date format" }, { status: 400 });
          }
          expiryDate = parsed;
        } else if (needsExpiry) {
          return Response.json(
            { detail: "expiry_date is required for this document type" },
            { status: 400 },
          );
        }

        let council: string | null;
        try {
          council = validateBargainingCouncil(
            docType,
            typeof councilValue === "string" ? councilValue : null,
          );
        } catch (error) {
          return Response.json(
            { detail: error instanceof Error ? error.message : "Invalid bargaining council" },
            { status: 400 },
          );
        }

        const db = createDb(env.DB);
        const company = await fetchOwnedCompany(db, companyId, session);
        if (company instanceof Response) return company;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentType = file.type || "application/octet-stream";
        const pdf = contentType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        let extractedLevel: number | null = null;
        let extractedExpiryDate: Date | null = null;
        if (pdf && (NEEDS_EXPIRY_TYPES.has(docType as DocType) || docType === "BBBEE")) {
          try {
            const text = await extractTextFromPdfBytes(bytes, 5);
            if (NEEDS_EXPIRY_TYPES.has(docType as DocType)) {
              const iso = extractExpiryFromText(text);
              if (iso) {
                const extracted = new Date(iso);
                if (!Number.isNaN(extracted.getTime())) extractedExpiryDate = extracted;
              }
            }
            if (docType === "BBBEE") extractedLevel = extractBbbeeLevelFromText(text);
          } catch {
            // Extraction is advisory; an unreadable PDF must not block vault storage.
          }
        }

        const scopeKey = isBcGos(docType) ? council! : "";
        const purgeWhere = and(
          eq(complianceDocuments.companyId, companyId),
          eq(complianceDocuments.docType, docType as DocType),
          eq(complianceDocuments.scopeKey, scopeKey),
        );
        const superseded = await db.select().from(complianceDocuments).where(purgeWhere);
        const id = crypto.randomUUID();
        const storageKey = `compliance/${companyId}/${id}`;
        try {
          await env.STORAGE.put(storageKey, bytes, { httpMetadata: { contentType } });
        } catch (error) {
          console.error("R2 put failed", error);
          return Response.json({ detail: "File storage failed" }, { status: 500 });
        }

        const now = new Date();
        const insertDocument = db.insert(complianceDocuments).values({
          id,
          companyId,
          docType: docType as DocType,
          fileName: file.name,
          storageKey,
          expiryDate,
          isCompliant,
          bargainingCouncil: council,
          scopeKey,
          extractedBbbeeLevel: extractedLevel,
          extractedExpiryDate,
          createdAt: now,
          updatedAt: now,
        });
        try {
          if (superseded.length > 0) {
            await db.batch([
              db.delete(sentReminders).where(
                inArray(
                  sentReminders.documentId,
                  superseded.map((document) => document.id),
                ),
              ),
              db.delete(complianceDocuments).where(purgeWhere),
              insertDocument,
            ]);
          } else {
            await db.batch([db.delete(complianceDocuments).where(purgeWhere), insertDocument]);
          }
        } catch (error) {
          await deleteQuietly(env.STORAGE, storageKey);
          console.error("Document replacement transaction failed", error);
          return Response.json({ detail: "Document could not be saved" }, { status: 500 });
        }

        await Promise.all(
          superseded
            .map((document) => document.storageKey)
            .filter((key): key is string => Boolean(key) && key !== storageKey)
            .map((key) => deleteQuietly(env.STORAGE, key)),
        );
        const created = (
          await db.select().from(complianceDocuments).where(eq(complianceDocuments.id, id))
        )[0]!;
        return Response.json(toApiDoc(created), { status: 201 });
      },
    },
  },
});

async function deleteQuietly(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.warn("Failed to clean up compliance object", key, error);
  }
}
