import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { tenders } from "@/db/schema/tender";
import { fetchOwnedTender } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/tender/$tenderId/returnables/toggle")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ detail: "Invalid JSON" }, { status: 400 });

        const returnableName = asString(body.returnable_name ?? "");
        const verified = Boolean(body.verified);
        if (!returnableName) {
          return Response.json({ detail: "returnable_name is required" }, { status: 400 });
        }

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;
        const { tender } = owned;

        // Only AI-parsed returnables for this tender can be toggled.
        let parsed: string[] = [];
        try {
          parsed = tender.parsedReturnables
            ? (JSON.parse(tender.parsedReturnables) as string[])
            : [];
        } catch {
          parsed = [];
        }
        if (!parsed.includes(returnableName)) {
          return Response.json({ detail: "Unknown returnable for this tender" }, { status: 400 });
        }

        let currentStatus: Record<
          string,
          { verified: boolean; verified_at: string | null; doc_ref: string | null }
        > = {};
        try {
          currentStatus = tender.returnableStatus
            ? (JSON.parse(tender.returnableStatus) as typeof currentStatus)
            : {};
        } catch {
          currentStatus = {};
        }
        const existing = currentStatus[returnableName];
        currentStatus[returnableName] = {
          verified,
          verified_at: verified ? new Date().toISOString() : null,
          doc_ref: existing?.doc_ref ?? null,
        };

        await db
          .update(tenders)
          .set({ returnableStatus: JSON.stringify(currentStatus), updatedAt: new Date() })
          .where(eq(tenders.id, params.tenderId));

        return Response.json({ returnable_status: currentStatus });
      },
    },
  },
});
