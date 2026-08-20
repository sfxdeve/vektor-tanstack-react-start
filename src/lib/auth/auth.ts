import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env as cloudflareEnv } from "cloudflare:workers";

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
        const cf = cloudflareEnv as unknown as Record<string, string | undefined>;
        const devMailbox = cf.DEV_MAILBOX ?? process.env.DEV_MAILBOX;
        const appUrl = cf.APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
        if (devMailbox === "1") {
          try {
            await fetch(`${appUrl}/api/dev/mailbox`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ to: user.email, url, type: "reset-password" }),
            });
          } catch {
            // ignore
          }
        }
        console.log(`[auth] Password reset URL for ${user.email}: ${url}`);
      },
    },
    secret:
      options?.secret ??
      (cloudflareEnv as unknown as Record<string, string | undefined>).BETTER_AUTH_SECRET ??
      process.env.BETTER_AUTH_SECRET,
    baseURL:
      options?.baseURL ??
      (cloudflareEnv as unknown as Record<string, string | undefined>).BETTER_AUTH_URL ??
      process.env.BETTER_AUTH_URL,
    plugins: [admin(), tanstackStartCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
