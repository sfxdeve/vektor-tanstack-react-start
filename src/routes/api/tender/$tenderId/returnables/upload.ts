import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { fetchOwnedTender } from "@/lib/ownership";
import { asString } from "@/lib/request-utils";
import { requireUser } from "@/lib/server-auth";
import { toApiTender } from "@/lib/tender-helpers";
import { updateReturnables } from "@/lib/tender-returnables";

const MAX_RETURNABLE_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/tender/$tenderId/returnables/upload")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;
        const formData = await request.formData().catch(() => null);
        if (!formData) return Response.json({ detail: "Invalid form data" }, { status: 400 });
        const file = formData.get("file");
        const returnableName = asString(formData.get("returnable_name"));
        if (!(file instanceof File) || file.size === 0)
          return Response.json({ detail: "File is required" }, { status: 400 });
        if (file.size > MAX_RETURNABLE_BYTES) {
          return Response.json(
            { detail: "Returnable file is too large (max 10MB)" },
            { status: 400 },
          );
        }
        if (!returnableName)
          return Response.json({ detail: "returnable_name is required" }, { status: 400 });

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;
        if (!parseStrings(owned.tender.parsedReturnables).includes(returnableName)) {
          return Response.json({ detail: "Unknown returnable for this tender" }, { status: 400 });
        }

        const extension = safeExtension(file.name);
        const storageKey = `returnables/${params.tenderId}/${crypto.randomUUID()}.${extension}`;
        try {
          await env.STORAGE.put(storageKey, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
          });
        } catch (error) {
          console.error("Returnable upload failed", error);
          return Response.json({ detail: "File storage failed" }, { status: 500 });
        }

        let replacedKey: string | null = null;
        try {
          const result = await updateReturnables(db, params.tenderId, (status) => {
            replacedKey = status[returnableName]?.doc_ref ?? null;
            status[returnableName] = {
              verified: true,
              verified_at: new Date().toISOString(),
              doc_ref: storageKey,
              file_name: file.name,
            };
            return status;
          });
          if (!result) throw new Error("Tender no longer exists");
          if (replacedKey && replacedKey !== storageKey)
            await deleteQuietly(env.STORAGE, replacedKey);
          return Response.json({
            returnable_status: result.status,
            tender: toApiTender(result.tender),
          });
        } catch (error) {
          await deleteQuietly(env.STORAGE, storageKey);
          console.error("Returnable status update failed", error);
          return Response.json({ detail: "Returnable changed; please retry" }, { status: 409 });
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

function safeExtension(name: string): string {
  const extension = name.includes(".") ? name.split(".").pop() : "bin";
  return extension?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
}

async function deleteQuietly(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.warn("Failed to clean up returnable object", key, error);
  }
}
