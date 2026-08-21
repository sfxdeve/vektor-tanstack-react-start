import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { requireAdmin } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/proof/$paymentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const db = createDb(env.DB);
        const rows = await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.id, params.paymentId));
        const payment = rows[0];
        if (!payment || !payment.proofPath) {
          return Response.json({ detail: "Proof not found" }, { status: 404 });
        }

        const obj = await env.STORAGE.get(payment.proofPath);
        if (!obj) return Response.json({ detail: "Proof not found" }, { status: 404 });

        const headers = new Headers();
        headers.set(
          "content-type",
          payment.proofContentType || obj.httpMetadata?.contentType || "application/octet-stream",
        );
        headers.set(
          "content-disposition",
          'inline; filename="' + (payment.proofFilename ?? "proof") + '"',
        );
        if (obj.size) headers.set("content-length", String(obj.size));
        return new Response(obj.body, { headers });
      },
    },
  },
});
