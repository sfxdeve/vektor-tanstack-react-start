import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments } from "@/db/schema/compliance";

async function getSession(request: Request) {
  const { createAuth } = await import("@/lib/auth/auth");
  const auth = createAuth(env.DB as unknown as D1Database);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export const Route = createFileRoute("/api/documents/download/$docId")({
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
        const docId = (params as Record<string, string>).docId;
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
        if (!doc.storageKey) {
          return new Response(JSON.stringify({ detail: "Document has no stored file" }), {
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

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        if (!storage) {
          return new Response(JSON.stringify({ detail: "Storage not configured" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const obj = await storage.get(doc.storageKey);
        if (!obj) {
          return new Response(JSON.stringify({ detail: "File not found in storage" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const headers = new Headers();
        const contentType = obj.httpMetadata?.contentType || "application/octet-stream";
        headers.set("content-type", contentType);
        headers.set("content-disposition", `attachment; filename="${doc.fileName}"`);
        if (obj.size) headers.set("content-length", String(obj.size));

        // R2ObjectBody has .body as ReadableStream and .arrayBuffer()
        const body = (obj as unknown as { body: ReadableStream }).body ?? (await obj.arrayBuffer());
        return new Response(body as BodyInit, { headers });
      },
    },
  },
});
