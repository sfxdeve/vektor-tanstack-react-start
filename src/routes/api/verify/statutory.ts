import { createFileRoute } from "@tanstack/react-router";

import { verify } from "@/lib/verification";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/verify/statutory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ detail: "Invalid JSON" }, { status: 400 });

        const kind = asString(body.kind ?? "");
        const value = asString(body.value ?? "");
        const result = verify(kind, value);
        if (!result) {
          return Response.json(
            { detail: `Unknown verification kind '${kind}'. Use one of: cipc, sars, csd.` },
            { status: 400 },
          );
        }
        return Response.json(result);
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const result = verify(
          url.searchParams.get("kind") ?? "",
          url.searchParams.get("value") ?? "",
        );
        if (!result) return Response.json({ detail: "Unknown verification kind" }, { status: 400 });
        return Response.json(result);
      },
    },
  },
});
