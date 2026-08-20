import { createFileRoute } from "@tanstack/react-router";

import { verify } from "@/lib/verification";

export const Route = createFileRoute("/api/verify/statutory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const kind = (body.kind ?? "") as string;
        const value = (body.value ?? "") as string;
        const result = verify(kind, value);
        if (!result) {
          return new Response(JSON.stringify({ detail: `Unknown verification kind: ${kind}` }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "";
        const value = url.searchParams.get("value") ?? "";
        const result = verify(kind, value);
        if (!result) {
          return new Response(JSON.stringify({ detail: `Unknown verification kind: ${kind}` }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
