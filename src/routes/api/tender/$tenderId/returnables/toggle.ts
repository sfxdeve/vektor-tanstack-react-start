import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { fetchOwnedTender } from "@/lib/ownership";
import { asString } from "@/lib/request-utils";
import { requireUser } from "@/lib/server-auth";
import { updateReturnables } from "@/lib/tender-returnables";

export const Route = createFileRoute("/api/tender/$tenderId/returnables/toggle")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ detail: "Invalid JSON" }, { status: 400 });
        const returnableName = asString(body.returnable_name);
        if (!returnableName)
          return Response.json({ detail: "returnable_name is required" }, { status: 400 });

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;
        if (!parseStrings(owned.tender.parsedReturnables).includes(returnableName)) {
          return Response.json({ detail: "Unknown returnable for this tender" }, { status: 400 });
        }
        try {
          const result = await updateReturnables(db, params.tenderId, (status) => {
            const existing = status[returnableName];
            const verified = Boolean(body.verified);
            status[returnableName] = {
              verified,
              verified_at: verified ? new Date().toISOString() : null,
              doc_ref: existing?.doc_ref ?? null,
              file_name: existing?.file_name ?? null,
            };
            return status;
          });
          if (!result) return Response.json({ detail: "Tender not found" }, { status: 404 });
          return Response.json({ returnable_status: result.status });
        } catch {
          return Response.json({ detail: "Returnables changed; please retry" }, { status: 409 });
        }
      },
    },
  },
});

function parseStrings(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}
