// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";

import { createDb } from "@/db";
import { getSessionFromRequest } from "@/lib/server-auth";
import { sweepAndSend } from "@/lib/reminder";

function getEnv(): Record<string, string | undefined> {
  const cf = (cfEnv as unknown as Record<string, string | undefined>) ?? {};
  const merged: Record<string, string | undefined> = { ...cf };
  if (typeof process !== "undefined" && process.env) {
    for (const k of [
      "DEV_MAILBOX",
      "DEV_AI_STUB",
      "APP_URL",
      "FRONTEND_URL",
      "RESEND_API_KEY",
      "SENDER_EMAIL",
      "SENDER_NAME",
      "EMAIL_FROM",
      "SUPPORT_EMAIL",
    ]) {
      if (!merged[k] && process.env[k]) merged[k] = process.env[k];
    }
  }
  return merged;
}

export const Route = createFileRoute("/api/reminders/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = getEnv();
        const devFlag = env.DEV_MAILBOX ?? env.DEV_AI_STUB ?? "0";
        const isLocalhost = url.hostname === "127.0.0.1" || url.hostname === "localhost";

        // Admin-only unless in dev/localhost where we allow for e2e
        const session = await getSessionFromRequest(request).catch(() => null);
        const userRole = (session?.user as unknown as { role?: string } | undefined)?.role;
        const isAdmin = userRole === "admin";

        if (!isAdmin && devFlag !== "1" && !isLocalhost) {
          return new Response(JSON.stringify({ detail: "Admin only" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb((cfEnv as unknown as { DB: D1Database }).DB as unknown as D1Database);
        try {
          const result = await sweepAndSend(db, env);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ detail: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const env = getEnv();
        const devFlag = env.DEV_MAILBOX ?? env.DEV_AI_STUB ?? "0";
        const isLocalhost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
        const session = await getSessionFromRequest(request).catch(() => null);
        const userRole = (session?.user as unknown as { role?: string } | undefined)?.role;
        const isAdmin = userRole === "admin";
        if (!isAdmin && devFlag !== "1" && !isLocalhost) {
          return new Response(JSON.stringify({ detail: "Admin only" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const db = createDb((cfEnv as unknown as { DB: D1Database }).DB as unknown as D1Database);
        try {
          const result = await sweepAndSend(db, env);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ detail: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
