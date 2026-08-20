import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { ALLOWED_PROOF_TYPES, MAX_PROOF_BYTES } from "@/lib/eft";
import { canTransition, eq, toApiEftPayment } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/upload-proof/$paymentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const paymentId = (params as Record<string, string>).paymentId;
        const db = createDb(env.DB as unknown as D1Database);

        const rows = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId));
        const payment = rows[0];
        if (!payment) {
          return new Response(JSON.stringify({ detail: "Payment not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (payment.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "Not your payment" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        // Upload is allowed from awaiting_proof → pending_review and rejected → pending_review;
        // pending_review re-upload is also allowed (idempotent overwrite of proof before admin review).
        const isReuploadFromPending = payment.status === "pending_review";
        if (!isReuploadFromPending && !canTransition(payment.status as never, "pending_review")) {
          return new Response(
            JSON.stringify({ detail: `Cannot upload proof for a ${payment.status} payment` }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid form data" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const file = formData.get("file") as File | null;
        if (!file || typeof file.arrayBuffer !== "function") {
          return new Response(JSON.stringify({ detail: "File is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const contentType = (file.type || "").toLowerCase();
        const ext = ALLOWED_PROOF_TYPES[contentType];
        if (!ext) {
          return new Response(
            JSON.stringify({ detail: "Proof must be a PDF, PNG, JPG, or WEBP file" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        let bytes: Uint8Array;
        try {
          const buf = await file.arrayBuffer();
          bytes = new Uint8Array(buf);
        } catch {
          return new Response(JSON.stringify({ detail: "Failed to read file" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        if (bytes.length === 0) {
          return new Response(JSON.stringify({ detail: "Uploaded file is empty" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (bytes.length > MAX_PROOF_BYTES) {
          return new Response(JSON.stringify({ detail: "File too large (max 10MB)" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        const storageKey = `eft/${paymentId}/proof`;
        if (storage) {
          try {
            await storage.put(storageKey, bytes, {
              httpMetadata: { contentType },
            });
          } catch (e) {
            console.error("R2 put failed for EFT proof", e);
            return new Response(JSON.stringify({ detail: "File storage failed" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
        } else {
          console.warn("STORAGE binding not available, skipping R2 put for EFT proof");
        }

        const now = new Date();
        await (
          db.update(eftPayments).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({
          proofPath: storageKey,
          proofContentType: contentType,
          proofFilename: file.name,
          status: "pending_review",
          rejectReason: null,
          updatedAt: now,
        }).where(eq(eftPayments.id, paymentId));

        const updatedRows = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, paymentId));
        const updated = updatedRows[0]!;

        return new Response(JSON.stringify(toApiEftPayment(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
