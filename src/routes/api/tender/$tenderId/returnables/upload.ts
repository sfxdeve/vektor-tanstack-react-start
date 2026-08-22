import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { tenders } from "@/db/schema/tender";
import { toApiTender } from "@/lib/tender-helpers";
import { fetchOwnedTender } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

/**
 * Upload a supporting file for a compulsory returnable. Marks the returnable
 * verified and stores the file in R2 under returnables/{tenderId}/.
 */
export const Route = createFileRoute("/api/tender/$tenderId/returnables/upload")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return Response.json({ detail: "Invalid form data" }, { status: 400 });
        }

        const file = formData.get("file");
        const returnableName = asString(formData.get("returnable_name"));
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ detail: "File is required" }, { status: 400 });
        }
        if (!returnableName) {
          return Response.json({ detail: "returnable_name is required" }, { status: 400 });
        }

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;

        const parsedReturnables = JSON.parse(owned.tender.parsedReturnables ?? "[]") as string[];
        if (!parsedReturnables.includes(returnableName)) {
          return Response.json({ detail: "Unknown returnable for this tender" }, { status: 400 });
        }

        // Persist the supporting file (fatal — verification without the doc is meaningless).
        const ext = file.name.includes(".") ? (file.name.split(".").pop() ?? "bin") : "bin";
        const storageKey = `returnables/${params.tenderId}/${crypto.randomUUID()}.${ext}`;
        try {
          await env.STORAGE.put(storageKey, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
          });
        } catch (e) {
          console.error("Returnable upload failed", e);
          return Response.json({ detail: "File storage failed" }, { status: 500 });
        }

        // Fetch-mutate-write: returnable names can contain dots ("SBD 6.1"),
        // which breaks naive nested-key writes.
        let statusMap: Record<
          string,
          {
            verified: boolean;
            verified_at: string | null;
            doc_ref: string | null;
            file_name?: string | null;
          }
        > = {};
        try {
          statusMap = JSON.parse(owned.tender.returnableStatus ?? "{}") as typeof statusMap;
        } catch {
          statusMap = {};
        }
        statusMap[returnableName] = {
          verified: true,
          verified_at: new Date().toISOString(),
          doc_ref: storageKey,
          file_name: file.name,
        };
        await db
          .update(tenders)
          .set({ returnableStatus: JSON.stringify(statusMap), updatedAt: new Date() })
          .where(eq(tenders.id, params.tenderId));

        return Response.json({
          returnable_status: statusMap,
          tender: toApiTender({ ...owned.tender, returnableStatus: JSON.stringify(statusMap) }),
        });
      },
    },
  },
});
