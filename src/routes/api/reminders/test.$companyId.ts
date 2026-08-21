// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments } from "@/db/schema/compliance";
import { getSessionFromRequest } from "@/lib/server-auth";
import { daysUntil, sendDocumentReminder } from "@/lib/reminder";

function getEnv(): Record<string, string | undefined> {
  const cf = (cfEnv as unknown as Record<string, string | undefined>) ?? {};
  const merged: Record<string, string | undefined> = { ...cf };
  if (typeof process !== "undefined" && process.env) {
    for (const k of [
      "DEV_MAILBOX",
      "DEV_AI_STUB",
      "APP_URL",
      "FRONTEND_URL",
      "RESEND_API_KEY",
      "SENDER_EMAIL",
      "SENDER_NAME",
      "EMAIL_FROM",
      "SUPPORT_EMAIL",
    ]) {
      if (!merged[k] && process.env[k]) merged[k] = process.env[k];
    }
  }
  return merged;
}

export const Route = createFileRoute("/api/reminders/test/$companyId")({
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

        const companyId = (params as Record<string, string>).companyId!;
        const url = new URL(request.url);
        const docId = url.searchParams.get("doc_id") || url.searchParams.get("docId") || "";

        const db = createDb((cfEnv as unknown as { DB: D1Database }).DB as unknown as D1Database);

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

        if (!company.contactEmail?.trim()) {
          return new Response(
            JSON.stringify({
              detail: "No contact_email set on this company — save one first in Company Setup.",
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        let doc: typeof complianceDocuments.$inferSelect | null = null;

        if (docId) {
          const rows = await (
            db.select().from(complianceDocuments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
          )(eq(complianceDocuments.id, docId));
          const candidate = rows[0];
          if (candidate && candidate.companyId === companyId) doc = candidate;
        } else {
          // Pick soonest-to-expire doc for this company
          const rows = await (
            db.select().from(complianceDocuments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
          )(eq(complianceDocuments.companyId, companyId));
          if (rows.length > 0) {
            // Sort by expiry ascending (nulls last)
            rows.sort((a, b) => {
              if (!a.expiryDate && !b.expiryDate) return 0;
              if (!a.expiryDate) return 1;
              if (!b.expiryDate) return -1;
              return (
                new Date(a.expiryDate as Date).getTime() - new Date(b.expiryDate as Date).getTime()
              );
            });
            doc = rows[0] ?? null;
          }
        }

        if (!doc) {
          return new Response(
            JSON.stringify({ detail: "No compliance documents to attach to the test reminder." }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const expiryStr =
          doc.expiryDate instanceof Date
            ? doc.expiryDate.toISOString().slice(0, 10)
            : String(doc.expiryDate ?? "");
        const days = daysUntil(expiryStr);
        let threshold = 30;
        if (days === null || days <= 0) threshold = 0;
        else if (days <= 7) threshold = 7;
        else threshold = 30;

        const env = getEnv();

        const result = await sendDocumentReminder(
          db,
          env,
          {
            id: company.id,
            companyName: company.companyName,
            contactEmail: company.contactEmail,
            alertsEnabled: company.alertsEnabled,
          },
          {
            id: doc.id,
            docType: doc.docType,
            fileName: doc.fileName,
            expiryDate: doc.expiryDate as Date,
            isCompliant: doc.isCompliant as boolean,
          },
          threshold,
          true, // force — bypass idempotency so testing works repeatedly
        );

        if (result.status !== "sent") {
          return new Response(
            JSON.stringify({
              detail: `Email delivery failed: ${result.error || "unknown error"}. Check RESEND_API_KEY and SENDER_EMAIL, or contact support.`,
              result,
            }),
            { status: 424, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ company_id: companyId, document_id: doc.id, ...result }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
