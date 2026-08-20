// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { myStats } from "@/lib/referral";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/referrals/my")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const db = createDb(env.DB as unknown as D1Database);
        const stats = await myStats(db, session.user.id);
        return new Response(JSON.stringify(stats), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
