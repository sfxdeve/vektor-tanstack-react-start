import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";

import { asString } from "@/lib/request-utils";

/**
 * Dev-only role promotion used by the local e2e/smoke journeys to mint admins
 * without wrangler access. Hard-gated: answers only when a DEV flag is set or
 * the request originates from loopback — absent from production traffic.
 */
export const Route = createFileRoute("/api/dev/set-role")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cf = cfEnv as unknown as Record<string, string | undefined>;
        const url = new URL(request.url);
        const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
        const devFlag =
          cf.DEV_MAILBOX === "1" ||
          cf.DEV_AI_STUB === "1" ||
          process.env.DEV_MAILBOX === "1" ||
          process.env.DEV_AI_STUB === "1";
        if (!devFlag && !isLoopback) {
          return Response.json({ detail: "Not available" }, { status: 404 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const email = asString(body?.email ?? "")
          .trim()
          .toLowerCase();
        const role = asString(body?.role ?? "").trim();
        if (!email) return Response.json({ detail: "email is required" }, { status: 400 });
        if (role !== "admin" && role !== "user") {
          return Response.json({ detail: "role must be admin or user" }, { status: 400 });
        }

        const db = createDb(cfEnv.DB);
        const target = (await db.select().from(user).where(eq(user.email, email)))[0];
        if (!target) return Response.json({ detail: "User not found" }, { status: 404 });

        await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, target.id));

        return Response.json({ ok: true, email, role });
      },
    },
  },
});
