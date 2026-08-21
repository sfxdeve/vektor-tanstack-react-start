// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/admin/impersonate/$userId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;
        const session = adminCheck;

        const userId = (params as Record<string, string>).userId;
        if (userId === session.user.id) {
          return new Response(JSON.stringify({ detail: "You cannot impersonate yourself" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const auth = createAuth(env.DB as unknown as D1Database);
        const targetUrl = new URL(request.url);
        const impUrl = `${targetUrl.protocol}//${targetUrl.host}/api/auth/admin/impersonate-user`;
        const impReq = new Request(impUrl, {
          method: "POST",
          headers: { ...Object.fromEntries(request.headers), "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        try {
          const impRes = await auth.handler(impReq);
          const body = await impRes.text();
          const headers = new Headers(impRes.headers);
          if (!headers.get("content-type")) headers.set("content-type", "application/json");
          return new Response(body, { status: impRes.status, headers });
        } catch (_e) {
          console.error("impersonate proxy failed", _e);
          return new Response(JSON.stringify({ detail: "Impersonation failed" }), { status: 500, headers: { "content-type": "application/json" } });
        }
      },
    },
  },
});
