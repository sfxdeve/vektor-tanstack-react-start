import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { extractBbbeeLevelFromBytes, extractExpiryFromBytes } from "@/lib/compliance";

async function getSession(request: Request) {
  const { createAuth } = await import("@/lib/auth/auth");
  const auth = createAuth(env.DB as unknown as D1Database);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export const Route = createFileRoute("/api/documents/preview-bbbee")({
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
        const docType = (formData.get("doc_type") ?? formData.get("docType") ?? "BBBEE") as string;

        const empty = { extracted_bbbee_level: null, extracted_expiry_date: null };
        if (!file || typeof file.arrayBuffer !== "function") {
          return new Response(JSON.stringify(empty), {
            headers: { "content-type": "application/json" },
          });
        }

        const name = (file.name ?? "").toLowerCase();
        const type = (file.type ?? "").toLowerCase();
        const isPdf = type === "application/pdf" || name.endsWith(".pdf");
        if (!isPdf) {
          return new Response(JSON.stringify(empty), {
            headers: { "content-type": "application/json" },
          });
        }

        let bytes: Uint8Array;
        try {
          const buf = await file.arrayBuffer();
          bytes = new Uint8Array(buf);
        } catch {
          return new Response(JSON.stringify(empty), {
            headers: { "content-type": "application/json" },
          });
        }

        let expiry: string | null = null;
        let level: number | null = null;

        if (["BBBEE", "COIDA", "TAX_PIN", "BARGAINING_COUNCIL_GOS"].includes(docType)) {
          expiry = extractExpiryFromBytes(bytes);
        }
        if (docType === "BBBEE") {
          level = extractBbbeeLevelFromBytes(bytes);
        }

        return new Response(
          JSON.stringify({ extracted_bbbee_level: level, extracted_expiry_date: expiry }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
