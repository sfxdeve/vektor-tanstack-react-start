import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";

import { captureRawEmail, clearEmails, listEmails } from "@/lib/dev-mailbox";

function isAllowed(): boolean {
  // Spec requires DEV_MAILBOX=1 for capture; strict — no DEV_AI_STUB or
  // localhost fallback, so the mailbox never leaks into other preview runs.
  return (
    (cfEnv as unknown as Record<string, string | undefined>).DEV_MAILBOX === "1" ||
    process.env.DEV_MAILBOX === "1"
  );
}

function notAvailable(): Response {
  return Response.json({ detail: "Not available" }, { status: 404 });
}

export const Route = createFileRoute("/api/dev/mailbox")({
  server: {
    handlers: {
      GET: async () => {
        if (!isAllowed()) return notAvailable();
        return Response.json(listEmails());
      },
      POST: async ({ request }) => {
        if (!isAllowed()) return notAvailable();
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const entry = captureRawEmail(body);
        return Response.json({ ok: true, id: entry.id, captured: entry });
      },
      DELETE: async () => {
        if (!isAllowed()) return notAvailable();
        const cleared = listEmails().length;
        clearEmails();
        return Response.json({ ok: true, cleared });
      },
    },
  },
});
