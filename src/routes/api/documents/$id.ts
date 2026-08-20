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
import { VALID_DOC_TYPES, validateBargainingCouncil } from "@/lib/compliance";

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

export const Route = createFileRoute("/api/documents/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const id = (params as Record<string, string>).id;
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        // First, try as companyId listing
        const companyRows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, id));
        const company = companyRows[0];
        if (company) {
          if (!isAdmin && company.userId !== session.user.id) {
            return new Response(
              JSON.stringify({ detail: "You don't have access to this company" }),
              {
                status: 403,
                headers: { "content-type": "application/json" },
              },
            );
          }
          const docs = await (
            db.select().from(complianceDocuments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
          )(eq(complianceDocuments.companyId, id));
          // Sort by createdAt desc
          docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return new Response(JSON.stringify(docs.map(toApiDoc)), {
            headers: { "content-type": "application/json" },
          });
        }

        // Otherwise try as single document fetch
        const doc = await fetchOwnedDocument(db, id!, session.user.id!, isAdmin);
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
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const docId = (params as Record<string, string>).id;
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
        // Ownership check via company
        if (!isAdmin) {
          const compRows = await (
            db.select().from(companies).where as unknown as (
              c: unknown,
            ) => Promise<(typeof companies.$inferSelect)[]>
          )(eq(companies.id, doc.companyId));
          const company = compRows[0];
          if (!company || company.userId !== session.user.id) {
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
        if (doc.storageKey && storage) {
          try {
            await storage.delete(doc.storageKey);
          } catch (e) {
            console.warn("R2 delete failed", e);
          }
        }

        await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
          eq(sentReminders.documentId, docId),
        );
        await (db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>)(
          eq(complianceDocuments.id, docId),
        );

        return new Response(JSON.stringify({ status: "deleted", id: docId }), {
          headers: { "content-type": "application/json" },
        });
      },
      PATCH: async ({ request, params }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const docId = (params as Record<string, string>).id;
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
          if (!company || company.userId !== session.user.id) {
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
          // Only valid for BC docs
          if (doc.docType !== "BARGAINING_COUNCIL_GOS") {
            // Ignore silently for other types, same as upload
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

        if ("doc_type" in body || "docType" in body) {
          const raw = (body.doc_type ?? body.docType) as string | null;
          if (raw) {
            const normalized = String(raw).trim().toUpperCase();
            if (!VALID_DOC_TYPES.has(normalized)) {
              return new Response(JSON.stringify({ detail: `Invalid doc_type: ${normalized}` }), {
                status: 400,
                headers: { "content-type": "application/json" },
              });
            }
            // Allow changing doc_type? For simplicity allow but validate BC tag
            if (normalized === "BARGAINING_COUNCIL_GOS") {
              const bcRaw = (body.bargaining_council ??
                body.bargainingCouncil ??
                doc.bargainingCouncil) as string | null;
              try {
                validateBargainingCouncil(normalized, bcRaw);
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Invalid bargaining council";
                return new Response(JSON.stringify({ detail: msg }), {
                  status: 400,
                  headers: { "content-type": "application/json" },
                });
              }
            }
            updates.docType = normalized;
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
