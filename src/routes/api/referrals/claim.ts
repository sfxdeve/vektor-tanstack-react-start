// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { recordSignup } from "@/lib/referral";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/referrals/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const rawCode = (body.code ?? body.ref_code ?? body.refCode ?? "") as string;
        const code = (rawCode || "").trim().toUpperCase();
        if (!code) {
          return new Response(JSON.stringify({ detail: "code is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);
        const referrerId = await recordSignup(db, session.user.id, session.user.email, code);

        if (!referrerId) {
          // Could be self-referral, unknown code, or already attributed — return not-attributed but 200
          return new Response(JSON.stringify({ attributed: false, code }), {
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ attributed: true, referrerUserId: referrerId, code }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
