import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { fetchOwnedTender } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

/** Download the original tender PDF persisted to R2 at analysis time. */
export const Route = createFileRoute("/api/tenders/download/$tenderId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;
        if (!owned.tender.pdfStorageKey) {
          return Response.json({ detail: "Tender PDF not found" }, { status: 404 });
        }

        try {
          const obj = await env.STORAGE.get(owned.tender.pdfStorageKey);
          if (!obj) {
            return Response.json({ detail: "Tender PDF not found" }, { status: 404 });
          }
          return new Response(obj.body, {
            headers: {
              "content-type": obj.httpMetadata?.contentType ?? "application/pdf",
              "content-disposition": `attachment; filename="tender-${params.tenderId}.pdf"`,
            },
          });
        } catch (e) {
          console.error("Tender PDF retrieval failed", e);
          return Response.json({ detail: "Storage retrieval failed" }, { status: 500 });
        }
      },
    },
  },
});
