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
import { isBcGos, validateBargainingCouncil } from "@/lib/compliance";
import { toApiDoc } from "@/lib/document-api";
import { getSessionFromRequest } from "@/lib/server-auth";

async function fetchOwnedDocument(
  db: ReturnType<typeof createDb>,
  docId: string,
  userId: string,
  isAdmin: boolean,
) {
  const docs = await (
    db.select().from(complianceDocuments).where as unknown as (
      c: unknown,
    ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
  )(eq(complianceDocuments.id, docId));
  const doc = docs[0];
  if (!doc) return null;
  if (isAdmin) return doc;
  const compRows = await (
    db.select().from(companies).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companies.$inferSelect)[]>
  )(eq(companies.id, doc.companyId));
  const company = compRows[0];
  if (!company || company.userId !== userId) return null;
  return doc;
}

async function deleteR2AndReminders(
  storage: R2Bucket | undefined,
  doc: typeof complianceDocuments.$inferSelect,
  db: ReturnType<typeof createDb>,
) {
  if (doc.storageKey && storage) {
    try {
      await storage.delete(doc.storageKey);
    } catch (e) {
      console.warn("R2 delete failed", e);
    }
  }
  try {
    await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
      eq(sentReminders.documentId, doc.id),
    );
  } catch (e) {
    console.warn("Failed to delete sent_reminders", doc.id, e);
  }
}

export const Route = createFileRoute("/api/documents/$id")({
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
        const docId = (params as Record<string, string>).id!;
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        const doc = await fetchOwnedDocument(db, docId, session.user.id!, isAdmin);
        if (!doc) {
          return new Response(JSON.stringify({ detail: "Document not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(toApiDoc(doc)), {
          headers: { "content-type": "application/json" },
        });
      },
      DELETE: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const docId = (params as Record<string, string>).id!;
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        const docs = await (
          db.select().from(complianceDocuments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
        )(eq(complianceDocuments.id, docId));
        const doc = docs[0];
        if (!doc) {
          return new Response(JSON.stringify({ detail: "Document not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (!isAdmin) {
          const compRows = await (
            db.select().from(companies).where as unknown as (
              c: unknown,
            ) => Promise<(typeof companies.$inferSelect)[]>
          )(eq(companies.id, doc.companyId));
          const company = compRows[0];
          if (!company || company.userId !== session.user.id!) {
            return new Response(
              JSON.stringify({ detail: "You don't have access to this document" }),
              {
                status: 403,
                headers: { "content-type": "application/json" },
              },
            );
          }
        }

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        await deleteR2AndReminders(storage, doc, db);
        await (db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>)(
          eq(complianceDocuments.id, docId),
        );

        return new Response(JSON.stringify({ status: "deleted", id: docId }), {
          headers: { "content-type": "application/json" },
        });
      },
      PATCH: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const docId = (params as Record<string, string>).id!;
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        const docs = await (
          db.select().from(complianceDocuments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
        )(eq(complianceDocuments.id, docId));
        const doc = docs[0];
        if (!doc) {
          return new Response(JSON.stringify({ detail: "Document not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (!isAdmin) {
          const compRows = await (
            db.select().from(companies).where as unknown as (
              c: unknown,
            ) => Promise<(typeof companies.$inferSelect)[]>
          )(eq(companies.id, doc.companyId));
          const company = compRows[0];
          if (!company || company.userId !== session.user.id!) {
            return new Response(
              JSON.stringify({ detail: "You don't have access to this document" }),
              {
                status: 403,
                headers: { "content-type": "application/json" },
              },
            );
          }
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const updates: Record<string, unknown> = {};

        if ("expiry_date" in body || "expiryDate" in body) {
          const raw = (body.expiry_date ?? body.expiryDate) as string | null;
          if (raw == null || String(raw).trim() === "") {
            return new Response(JSON.stringify({ detail: "expiry_date cannot be empty" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          const d = new Date(String(raw).trim());
          if (Number.isNaN(d.getTime())) {
            return new Response(JSON.stringify({ detail: "Invalid expiry_date" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          updates.expiryDate = d;
        }

        if ("is_compliant" in body || "isCompliant" in body) {
          const raw = body.is_compliant ?? body.isCompliant;
          updates.isCompliant = Boolean(raw);
        }

        if ("bargaining_council" in body || "bargainingCouncil" in body) {
          const raw = (body.bargaining_council ?? body.bargainingCouncil) as string | null;
          if (!isBcGos(doc.docType)) {
            // Ignore silently for non-BC types
          } else {
            try {
              const normalized = validateBargainingCouncil(doc.docType, raw);
              updates.bargainingCouncil = normalized;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Invalid bargaining council";
              return new Response(JSON.stringify({ detail: msg }), {
                status: 400,
                headers: { "content-type": "application/json" },
              });
            }
          }
        }

        if (Object.keys(updates).length === 0) {
          return new Response(JSON.stringify(toApiDoc(doc)), {
            headers: { "content-type": "application/json" },
          });
        }

        updates.updatedAt = new Date();

        await (
          db.update(complianceDocuments).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )(updates as never).where(eq(complianceDocuments.id, docId));

        // If expiry or compliance flag changed, clear idempotency so new thresholds can fire
        if ("expiryDate" in updates || "isCompliant" in updates) {
          try {
            await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
              eq(sentReminders.documentId, docId),
            );
          } catch (e) {
            console.warn("Failed to clear sent_reminders after doc edit", docId, e);
          }
        }

        const updatedRows = await (
          db.select().from(complianceDocuments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
        )(eq(complianceDocuments.id, docId));
        const updated = updatedRows[0]!;
        return new Response(JSON.stringify(toApiDoc(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
