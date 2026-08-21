// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";

import { clearEmails, listEmails } from "@/lib/dev-mailbox";

function getEnv(): Record<string, string | undefined> {
  const cf = (cfEnv as unknown as Record<string, string | undefined>) ?? {};
  const merged: Record<string, string | undefined> = { ...cf };
  if (typeof process !== "undefined" && process.env) {
    for (const k of ["DEV_MAILBOX", "DEV_AI_STUB", "APP_URL", "RESEND_API_KEY"]) {
      if (!merged[k] && process.env[k]) merged[k] = process.env[k];
    }
  }
  return merged;
}

function isAllowed(request: Request): boolean {
  const env = getEnv();
  const devFlag =
    env.DEV_MAILBOX ?? env.DEV_AI_STUB ?? process.env.DEV_MAILBOX ?? process.env.DEV_AI_STUB;
  if (devFlag === "1") return true;
  const url = new URL(request.url);
  const isLocalhost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (isLocalhost) return true;
  return false;
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
        if (!isAllowed(request)) {
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
        // If body already looks like a captured email (has to/subject/html), store directly
        // Otherwise wrap as raw capture
        if (obj.to || obj.subject || obj.html || obj.type) {
          // Capture with helper that normalizes
          const { addRawCapture } = await import("@/lib/dev-mailbox");
          const entry = addRawCapture(obj);
          // Also try to ensure raw capture for reminder shape
          return new Response(JSON.stringify({ ok: true, id: entry.id, captured: entry }), {
            headers: { "content-type": "application/json" },
          });
        }

        // Generic capture
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
