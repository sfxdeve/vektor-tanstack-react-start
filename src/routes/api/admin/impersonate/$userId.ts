// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "@/lib/auth/auth";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/admin/impersonate/$userId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const userId = (params as Record<string, string>).userId;
        if (userId === session.user.id) {
          return new Response(JSON.stringify({ detail: "You cannot impersonate yourself" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        // Proxy to better-auth's impersonateUser endpoint so we get correct cookie handling
        const auth = createAuth(env.DB as unknown as D1Database);
        const targetUrl = new URL(request.url);
        const impUrl = `${targetUrl.protocol}//${targetUrl.host}/api/auth/admin/impersonate-user`;
        const impReq = new Request(impUrl, {
          method: "POST",
          headers: {
            ...Object.fromEntries(request.headers),
            "content-type": "application/json",
          },
          body: JSON.stringify({ userId }),
        });
        try {
          const impRes = await auth.handler(impReq);
          // Forward the response as-is (includes set-cookie)
          const body = await impRes.text();
          const headers = new Headers(impRes.headers);
          // Ensure content-type json if missing
          if (!headers.get("content-type")) headers.set("content-type", "application/json");
          return new Response(body, { status: impRes.status, headers });
        } catch (_e) {
          console.error("impersonate proxy failed", _e);
          return new Response(JSON.stringify({ detail: "Impersonation failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
