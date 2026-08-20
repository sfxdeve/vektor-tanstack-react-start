import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";

const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/eft/admin/proof/$paymentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
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
        if (!payment || !payment.proofPath) {
          return new Response(JSON.stringify({ detail: "Proof not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        if (!storage) {
          return new Response(JSON.stringify({ detail: "Storage not configured" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        const obj = await storage.get(payment.proofPath);
        if (!obj) {
          return new Response(JSON.stringify({ detail: "Proof not found in storage" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const contentType =
          payment.proofContentType || obj.httpMetadata?.contentType || "application/octet-stream";
        const body = await obj.arrayBuffer();
        return new Response(body, {
          headers: {
            "content-type": contentType,
            "content-disposition": `inline; filename="${payment.proofFilename ?? "proof"}"`,
          },
        });
      },
    },
  },
});
