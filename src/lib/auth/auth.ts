import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env as cfEnv } from "cloudflare:workers";

import { createDb } from "@/db";
import * as schema from "@/db/schema";
import { ensureReferralCode, recordSignup } from "@/lib/referral";

export interface CreateAuthOptions {
  baseURL?: string;
  secret?: string;
}

/** Typed view over the Worker env: string vars plus the D1 binding. */
function workerEnv(): Record<string, string | undefined> & { DB?: D1Database } {
  return cfEnv as unknown as Record<string, string | undefined> & { DB?: D1Database };
}

export function createAuth(d1: D1Database, options?: CreateAuthOptions) {
  const db = createDb(d1);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const hookDb = createDb(workerEnv().DB ?? d1);
            const userId = createdUser.id;
            const userEmail = createdUser.email;
            try {
              await ensureReferralCode(hookDb, userId);
            } catch {
              // best-effort: code generation failure must not block signup
            }
            // Attribution when signup carried ?ref= via referredByCode.
            // Guardrails (unknown code / self-referral / first-code-wins)
            // live in recordSignup; failures never block signup.
            const rawCode =
              typeof createdUser.referredByCode === "string"
                ? createdUser.referredByCode
                : undefined;
            if (rawCode) {
              try {
                await recordSignup(hookDb, userId, userEmail, rawCode);
              } catch {
                // ignore
              }
            }
          },
        },
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        referralCode: {
          type: "string",
          required: false,
          input: false,
        },
        referredByUserId: {
          type: "string",
          required: false,
          input: false,
        },
        referredByCode: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        if (workerEnv().DEV_MAILBOX === "1" || process.env.DEV_MAILBOX === "1") {
          try {
            await fetch(`${getAppUrl()}/api/dev/mailbox`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ to: user.email, url, type: "reset-password" }),
            });
          } catch {
            // dev mailbox capture is best-effort
          }
        }
        console.log(`[auth] Password reset URL for ${user.email}: ${url}`);
      },
    },
    secret: options?.secret ?? workerEnv().BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
    baseURL: options?.baseURL ?? workerEnv().BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
    plugins: [admin(), tanstackStartCookies()],
  });
}

function getAppUrl(): string {
  return (
    workerEnv().APP_URL ?? process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 4173}`
  );
}
