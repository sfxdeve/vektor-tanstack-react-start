import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import { isBcGos, validateBargainingCouncil } from "@/lib/compliance";
import { toApiDoc } from "@/lib/document-api";
import { fetchOwnedDocument } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/documents/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const owned = await fetchOwnedDocument(db, params.id, session);
        if (owned instanceof Response) return owned;
        return Response.json(toApiDoc(owned.document));
      },
      DELETE: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const owned = await fetchOwnedDocument(db, params.id, session);
        if (owned instanceof Response) return owned;
        const { document } = owned;

        // Delete the stored object and the reminder idempotency rows so a
        // replacement document gets a fresh expiry schedule.
        if (document.storageKey) {
          try {
            await env.STORAGE.delete(document.storageKey);
          } catch (e) {
            console.warn("R2 delete failed", document.storageKey, e);
          }
        }
        await db.delete(sentReminders).where(eq(sentReminders.documentId, document.id));
        await db.delete(complianceDocuments).where(eq(complianceDocuments.id, document.id));

        return Response.json({ status: "deleted", id: document.id });
      },
      PATCH: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ detail: "Invalid JSON" }, { status: 400 });

        const db = createDb(env.DB);
        const owned = await fetchOwnedDocument(db, params.id, session);
        if (owned instanceof Response) return owned;
        const { document } = owned;

        const updates: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(body, "expiry_date")) {
          const raw = asString(body.expiry_date).trim();
          const d = new Date(raw);
          if (!raw || Number.isNaN(d.getTime())) {
            return Response.json({ detail: "Invalid expiry_date" }, { status: 400 });
          }
          updates.expiryDate = d;
        }

        if (Object.prototype.hasOwnProperty.call(body, "is_compliant")) {
          updates.isCompliant = Boolean(body.is_compliant);
        }

        if (
          Object.prototype.hasOwnProperty.call(body, "bargaining_council") &&
          isBcGos(document.docType)
        ) {
          try {
            updates.bargainingCouncil = validateBargainingCouncil(
              document.docType,
              typeof body.bargaining_council === "string" ? body.bargaining_council : null,
            );
          } catch (e) {
            return Response.json(
              { detail: e instanceof Error ? e.message : "Invalid bargaining council" },
              { status: 400 },
            );
          }
        }

        if (Object.keys(updates).length === 0) {
          return Response.json(toApiDoc(document));
        }

        updates.updatedAt = new Date();
        await db
          .update(complianceDocuments)
          .set(updates)
          .where(eq(complianceDocuments.id, document.id));

        // Expiry or compliance flag changed — clear idempotency so the new
        // threshold schedule can fire.
        if ("expiryDate" in updates || "isCompliant" in updates) {
          await db.delete(sentReminders).where(eq(sentReminders.documentId, document.id));
        }

        const updated = (
          await db.select().from(complianceDocuments).where(eq(complianceDocuments.id, document.id))
        )[0]!;
        return Response.json(toApiDoc(updated));
      },
    },
  },
});
