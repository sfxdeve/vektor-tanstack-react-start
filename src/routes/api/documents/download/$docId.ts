import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { fetchOwnedDocument } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/documents/download/$docId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const owned = await fetchOwnedDocument(db, params.docId, session);
        if (owned instanceof Response) return owned;
        const { document } = owned;

        if (!document.storageKey) {
          return Response.json({ detail: "Document has no stored file" }, { status: 404 });
        }

        const obj = await env.STORAGE.get(document.storageKey);
        if (!obj) {
          return Response.json({ detail: "File not found in storage" }, { status: 404 });
        }

        const headers = new Headers();
        headers.set("content-type", obj.httpMetadata?.contentType || "application/octet-stream");
        headers.set("content-disposition", `attachment; filename="${document.fileName}"`);
        if (obj.size) headers.set("content-length", String(obj.size));
        return new Response(obj.body, { headers });
      },
    },
  },
});
