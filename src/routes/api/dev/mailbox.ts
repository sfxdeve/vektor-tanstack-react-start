import { createFileRoute } from "@tanstack/react-router";

import { clearEmails, listEmails } from "@/lib/dev-mailbox";
import { getMailboxEnv } from "@/lib/reminder-env";

function isAllowed(_request?: Request): boolean {
  const env = getMailboxEnv();
  // Spec requires DEV_MAILBOX=1 for capture; strict — no DEV_AI_STUB or localhost fallback.
  // Keeps dev mailbox from leaking in preview where only DEV_AI_STUB might be set.
  return env.DEV_MAILBOX === "1" || process.env.DEV_MAILBOX === "1";
}

export const Route = createFileRoute("/api/dev/mailbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAllowed(request)) {
          return new Response(JSON.stringify({ detail: "Not available" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const emails = listEmails();
        return new Response(JSON.stringify(emails), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        if (!isAllowed()) {
          return new Response(JSON.stringify({ detail: "Not available" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        let body: unknown;
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        } else {
          try {
            const text = await request.text();
            try {
              body = JSON.parse(text);
            } catch {
              body = { raw: text };
            }
          } catch {
            body = {};
          }
        }

        // Normalize and capture
        const obj = (body ?? {}) as Record<string, unknown>;
        if (obj.to || obj.subject || obj.html || obj.type) {
          const { addRawCapture } = await import("@/lib/dev-mailbox");
          const entry = addRawCapture(obj);
          return new Response(JSON.stringify({ ok: true, id: entry.id, captured: entry }), {
            headers: { "content-type": "application/json" },
          });
        }

        const { addRawCapture } = await import("@/lib/dev-mailbox");
        const entry = addRawCapture(obj);
        return new Response(JSON.stringify({ ok: true, id: entry.id }), {
          headers: { "content-type": "application/json" },
        });
      },
      DELETE: async ({ request }) => {
        if (!isAllowed(request)) {
          return new Response(JSON.stringify({ detail: "Not available" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const before = listEmails().length;
        clearEmails();
        return new Response(JSON.stringify({ ok: true, cleared: before }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
