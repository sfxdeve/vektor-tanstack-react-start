import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments, type ComplianceDocumentRow } from "@/db/schema/compliance";
import { daysUntil, pickThreshold, sendDocumentReminder } from "@/lib/reminder";
import { fetchOwnedCompany } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/reminders/test/$companyId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const company = await fetchOwnedCompany(db, params.companyId, session);
        if (company instanceof Response) return company;

        if (!company.contactEmail?.trim()) {
          return Response.json(
            { detail: "No contact_email set on this company — save one first in Company Setup." },
            { status: 400 },
          );
        }

        const docId = new URL(request.url).searchParams.get("doc_id") ?? "";
        let document: ComplianceDocumentRow | undefined;
        if (docId) {
          const rows = await db
            .select()
            .from(complianceDocuments)
            .where(eq(complianceDocuments.id, docId));
          const candidate = rows[0];
          if (candidate?.companyId === params.companyId) document = candidate;
        } else {
          // Soonest-to-expire compliant doc for this company.
          const rows = await db
            .select()
            .from(complianceDocuments)
            .where(eq(complianceDocuments.companyId, params.companyId))
            .orderBy(asc(complianceDocuments.expiryDate));
          document = rows[0];
        }
        if (!document) {
          return Response.json(
            { detail: "No compliance documents to attach to the test reminder." },
            { status: 400 },
          );
        }

        const threshold = pickThreshold(daysUntil(document.expiryDate ?? null)) ?? 30;

        // force=true bypasses idempotency so testing works repeatedly.
        const result = await sendDocumentReminder(
          db,
          env as unknown as Record<string, string | undefined>,
          {
            id: company.id,
            companyName: company.companyName,
            contactEmail: company.contactEmail,
            alertsEnabled: Boolean(company.alertsEnabled),
          },
          {
            id: document.id,
            docType: document.docType,
            fileName: document.fileName,
            expiryDate: document.expiryDate,
            isCompliant: Boolean(document.isCompliant),
          },
          threshold,
          true,
        );

        if (result.status !== "sent") {
          return Response.json(
            {
              detail:
                `Email delivery failed: ${result.error || "unknown error"}. ` +
                `Check RESEND_API_KEY and sender config, or contact support.`,
              result,
            },
            { status: 424 },
          );
        }
        return Response.json({ company_id: params.companyId, document_id: document.id, ...result });
      },
    },
  },
});
