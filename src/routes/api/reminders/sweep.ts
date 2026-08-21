import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";

import { createDb } from "@/db";
import { getReminderEnv } from "@/lib/reminder-env";
import { getSessionFromRequest } from "@/lib/server-auth";
import { sweepAndSend } from "@/lib/reminder";

async function handleSweep(request: Request): Promise<Response> {
  const env = getReminderEnv();
  const isDev = env.DEV_MAILBOX === "1";
  const session = await getSessionFromRequest(request).catch(() => null);
  const userRole = (session?.user as unknown as { role?: string } | undefined)?.role;
  const isAdmin = userRole === "admin";

  if (!isAdmin && !isDev) {
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
}

export const Route = createFileRoute("/api/reminders/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => handleSweep(request),
      GET: async ({ request }) => handleSweep(request),
    },
  },
});
