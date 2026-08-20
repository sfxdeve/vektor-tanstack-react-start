import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createDb } from "@/db";
import * as schema from "@/db/schema";

export interface CreateAuthOptions {
  baseURL?: string;
  secret?: string;
}

export function createAuth(d1: D1Database, options?: CreateAuthOptions) {
  const db = createDb(d1);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        // In dev with DEV_MAILBOX=1, we capture to an in-memory mailbox via /api/dev/mailbox
        // For now just console.log; real Resend integration comes in later slice (reminders).
        // The URL is still returned to the client via better-auth's internal flow.
        if (process.env.DEV_MAILBOX === "1") {
          try {
            // Attempt to POST to local mailbox if available (best-effort)
            await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/dev/mailbox`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ to: user.email, url, type: "reset-password" }),
            });
          } catch {
            // ignore
          }
        }
        // In production we would send via Resend; for now no-op (better-auth still creates token).
        console.log(`[auth] Password reset URL for ${user.email}: ${url}`);
      },
    },
    secret: options?.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: options?.baseURL ?? process.env.BETTER_AUTH_URL,
    plugins: [admin(), tanstackStartCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
