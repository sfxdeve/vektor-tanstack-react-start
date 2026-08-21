import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { ALLOWED_PROOF_TYPES, MAX_PROOF_BYTES } from "@/lib/eft";
import { toApiEftPayment } from "@/lib/eft-api";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/upload-proof/$paymentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const rows = await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.id, params.paymentId));
        const payment = rows[0];
        if (!payment) return Response.json({ detail: "Payment not found" }, { status: 404 });
        if (payment.userId !== session.user.id) {
          return Response.json({ detail: "Not your payment" }, { status: 403 });
        }
        // awaiting_proof/rejected → pending_review; re-upload before admin
        // review overwrites the proof in place.
        if (payment.status === "confirmed") {
          return Response.json(
            { detail: "Cannot upload proof for a confirmed payment" },
            { status: 400 },
          );
        }

        const formData = await request.formData().catch(() => null);
        if (!formData) return Response.json({ detail: "Invalid form data" }, { status: 400 });

        const file = formData.get("file");
        if (!(file instanceof File)) {
          return Response.json({ detail: "File is required" }, { status: 400 });
        }

        const contentType = file.type.toLowerCase();
        if (!(contentType in ALLOWED_PROOF_TYPES)) {
          return Response.json(
            { detail: "Proof must be a PDF, PNG, JPG, or WEBP file" },
            { status: 400 },
          );
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length === 0) {
          return Response.json({ detail: "Uploaded file is empty" }, { status: 400 });
        }
        if (bytes.length > MAX_PROOF_BYTES) {
          return Response.json({ detail: "File too large (max 10MB)" }, { status: 400 });
        }

        const storageKey = `eft/${params.paymentId}/proof`;
        try {
          await env.STORAGE.put(storageKey, bytes, { httpMetadata: { contentType } });
        } catch (e) {
          console.error("R2 put failed for EFT proof", e);
          return Response.json({ detail: "File storage failed" }, { status: 500 });
        }

        const now = new Date();
        await db
          .update(eftPayments)
          .set({
            proofPath: storageKey,
            proofContentType: contentType,
            proofFilename: file.name,
            status: "pending_review",
            rejectReason: null,
            updatedAt: now,
          })
          .where(eq(eftPayments.id, params.paymentId));

        const updated = (
          await db.select().from(eftPayments).where(eq(eftPayments.id, params.paymentId))
        )[0]!;
        return Response.json(toApiEftPayment(updated));
      },
    },
  },
});
