// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";

export const Route = createFileRoute("/api/dev/set-role")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cf = cfEnv as unknown as Record<string, string | undefined>;
        const url = new URL(request.url);
        const isLocalhost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
        const devFlag =
          cf.DEV_MAILBOX ?? cf.DEV_AI_STUB ?? process.env.DEV_MAILBOX ?? process.env.DEV_AI_STUB;
        // Allow in local preview/e2e (localhost) even if env vars not propagated; block in production
        if (devFlag !== "1" && !isLocalhost) {
          return new Response(JSON.stringify({ detail: "Not available" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const email = ((body.email as string) || "").trim().toLowerCase();
        const role = ((body.role as string) || "").trim();
        if (!email) {
          return new Response(JSON.stringify({ detail: "email is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!["admin", "user"].includes(role)) {
          return new Response(JSON.stringify({ detail: "role must be admin or user" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb((cfEnv as unknown as { DB: D1Database }).DB as unknown as D1Database);
        const rows = await (
          db.select().from(user).where as unknown as (
            c: unknown,
          ) => Promise<(typeof user.$inferSelect)[]>
        )(eq(user.email, email));
        const target = rows[0];
        if (!target) {
          return new Response(JSON.stringify({ detail: "User not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        await (
          db.update(user).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({ role: role as "admin" | "user", updatedAt: new Date() }).where(eq(user.id, target.id));

        return new Response(JSON.stringify({ ok: true, email, role }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
