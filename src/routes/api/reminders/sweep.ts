import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { sweepAndSend } from "@/lib/reminder";
import { getSession, isAdminSession } from "@/lib/server-auth";

export const Route = createFileRoute("/api/reminders/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Admin-only manual trigger (the cron schedule runs unattended).
        // When DEV_MAILBOX=1 the mailbox captures everything anyway, so any
        // authenticated user may trigger the sweep — this keeps the local
        // e2e journeys single-session and never reaches production.
        let allowed = false;
        const session = await getSession(request);
        if (isAdminSession(session)) {
          allowed = true;
        } else if (
          (env as unknown as Record<string, string | undefined>).DEV_MAILBOX === "1" &&
          session?.user
        ) {
          allowed = true;
        }
        if (!allowed) {
          return Response.json({ detail: "Admin only" }, { status: 403 });
        }

        try {
          const result = await sweepAndSend(
            createDb(env.DB),
            env as unknown as Record<string, string | undefined>,
          );
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { detail: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
