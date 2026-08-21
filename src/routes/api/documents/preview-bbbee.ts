import { createFileRoute } from "@tanstack/react-router";

import {
  type DocType,
  NEEDS_EXPIRY_TYPES,
  extractBbbeeLevelFromPdfBytes,
  extractExpiryFromPdfBytes,
} from "@/lib/compliance";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/documents/preview-bbbee")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        // Peek inside a compliance-cert PDF BEFORE the contractor submits the
        // upload form, so we can pre-fill the expiry field. Nothing is persisted.
        const formData = await request.formData().catch(() => null);
        if (!formData) return Response.json({ detail: "Invalid form data" }, { status: 400 });

        const file = formData.get("file");
        const docTypeRaw = formData.get("doc_type");
        const docType = typeof docTypeRaw === "string" && docTypeRaw ? docTypeRaw : "BBBEE";

        const empty = { extracted_bbbee_level: null, extracted_expiry_date: null };
        if (!(file instanceof File)) return Response.json(empty);

        const isPdf =
          file.type.toLowerCase() === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) return Response.json(empty);

        const bytes = new Uint8Array(await file.arrayBuffer());
        let expiry: string | null = null;
        let level: number | null = null;
        if (NEEDS_EXPIRY_TYPES.has(docType as DocType)) {
          expiry = await extractExpiryFromPdfBytes(bytes);
        }
        if (docType === "BBBEE") {
          level = await extractBbbeeLevelFromPdfBytes(bytes);
        }
        return Response.json({ extracted_bbbee_level: level, extracted_expiry_date: expiry });
      },
    },
  },
});
