// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { lookupReferrer } from "@/lib/referral";

export const Route = createFileRoute("/api/referrals/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();

        if (!code || code.length < 4 || code.length > 32) {
          return new Response(JSON.stringify({ detail: "Referral code is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);
        const preview = await lookupReferrer(db, code);
        if (!preview) {
          return new Response(JSON.stringify({ detail: "Referral code not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(preview), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
