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
  extractBbbeeLevelFromPdfBytes,
  extractExpiryFromPdfBytes,
  isBcGos,
  validateBargainingCouncil,
} from "@/lib/compliance";
import { toApiDoc } from "@/lib/document-api";
import { fetchOwnedCompany } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

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
        // Default true — an uploaded certificate is presumed compliant.
        const isCompliantRaw = formData.get("is_compliant");
        const isCompliant =
          typeof isCompliantRaw === "string"
            ? !["false", "0", "no"].includes(isCompliantRaw.toLowerCase())
            : true;
        const bargainingCouncilRaw = formData.get("bargaining_council");
        const bargainingCouncil =
          typeof bargainingCouncilRaw === "string" ? bargainingCouncilRaw : null;

        if (!(file instanceof File) || !file.name) {
          return Response.json({ detail: "File is required" }, { status: 400 });
        }
        if (!companyId) {
          return Response.json({ detail: "company_id is required" }, { status: 400 });
        }
        if (!docType || !VALID_DOC_TYPES.has(docType)) {
          return Response.json(
            { detail: `Invalid doc_type. Must be one of ${DOC_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        if (!expiryRaw) {
          return Response.json({ detail: "expiry_date is required" }, { status: 400 });
        }
        const expiryDate = new Date(expiryRaw);
        if (Number.isNaN(expiryDate.getTime())) {
          return Response.json({ detail: "Invalid expiry_date format" }, { status: 400 });
        }

        let bcCode: string | null;
        try {
          bcCode = validateBargainingCouncil(docType, bargainingCouncil);
        } catch (e) {
          return Response.json(
            { detail: e instanceof Error ? e.message : "Invalid bargaining council" },
            { status: 400 },
          );
        }

        const db = createDb(env.DB);
        const company = await fetchOwnedCompany(db, companyId, session);
        if (company instanceof Response) return company;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentType = file.type || "application/octet-stream";
        const isPdf = contentType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        // Best-effort extraction off the printed certificate so we can warn when
        // the typed expiry disagrees with the document. Never blocks the upload.
        let extractedLevel: number | null = null;
        let extractedExpiryDate: Date | null = null;
        if (isPdf && NEEDS_EXPIRY_TYPES.has(docType as DocType)) {
          const iso = await extractExpiryFromPdfBytes(bytes);
          if (iso) {
            const d = new Date(iso);
            if (!Number.isNaN(d.getTime())) extractedExpiryDate = d;
          }
        }
        if (isPdf && docType === "BBBEE") {
          extractedLevel = await extractBbbeeLevelFromPdfBytes(bytes);
        }

        const docId = crypto.randomUUID();
        const storageKey = `compliance/${companyId}/${docId}`;
        try {
          await env.STORAGE.put(storageKey, bytes, { httpMetadata: { contentType } });
        } catch (e) {
          console.error("R2 put failed", e);
          return Response.json({ detail: "File storage failed" }, { status: 500 });
        }

        // Purge any prior document of the same type — users hold one live copy
        // per certificate, and stale sent-reminder rows must not suppress alerts
        // against a new expiry date. BC letters are scoped per council so a fresh
        // BCCEI letter never deletes the NBCEI one.
        const purgeWhere = isBcGos(docType)
          ? and(
              eq(complianceDocuments.companyId, companyId),
              eq(complianceDocuments.docType, docType as DocType),
              eq(complianceDocuments.bargainingCouncil, bcCode!),
            )
          : and(
              eq(complianceDocuments.companyId, companyId),
              eq(complianceDocuments.docType, docType as DocType),
            );
        const superseded = await db.select().from(complianceDocuments).where(purgeWhere);
        for (const old of superseded) {
          if (old.storageKey) {
            try {
              await env.STORAGE.delete(old.storageKey);
            } catch (e) {
              console.warn("R2 delete failed for superseded object", old.storageKey, e);
            }
          }
        }
        if (superseded.length > 0) {
          const ids = superseded.map((d) => d.id);
          await db.delete(sentReminders).where(inArray(sentReminders.documentId, ids));
          await db.delete(complianceDocuments).where(inArray(complianceDocuments.id, ids));
        }

        const now = new Date();
        await db.insert(complianceDocuments).values({
          id: docId,
          companyId,
          docType: docType as DocType,
          fileName: file.name,
          storageKey,
          expiryDate,
          isCompliant,
          bargainingCouncil: bcCode,
          extractedBbbeeLevel: extractedLevel,
          extractedExpiryDate,
          createdAt: now,
          updatedAt: now,
        });

        const created = (
          await db.select().from(complianceDocuments).where(eq(complianceDocuments.id, docId))
        )[0]!;
        return Response.json(toApiDoc(created), { status: 201 });
      },
    },
  },
});
