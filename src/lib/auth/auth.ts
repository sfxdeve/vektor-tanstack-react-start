import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env as cloudflareEnv } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import * as schema from "@/db/schema";
import { REF_ALPHABET } from "@/lib/eft";

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
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            try {
              // Generate VEK-XXXXXX referral code for every new user, retry on collision.
              const d1 = (cloudflareEnv as unknown as { DB?: D1Database }).DB;
              const targetDb = d1 ? createDb(d1 as unknown as D1Database) : db;
              const existing = (createdUser as unknown as { referralCode?: string }).referralCode;
              if (existing) return;
              const userId = (createdUser as unknown as { id: string }).id;
              for (let attempt = 0; attempt < 5; attempt++) {
                let suffix = "";
                for (let i = 0; i < 6; i++) {
                  suffix += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]!;
                }
                const code = `VEK-${suffix}`;
                const clash = await (
                  targetDb.select().from(schema.user).where as unknown as (
                    c: unknown,
                  ) => Promise<(typeof schema.user.$inferSelect)[]>
                )(eq(schema.user.referralCode, code));
                if (clash.length > 0) continue;
                try {
                  await (
                    targetDb.update(schema.user).set as unknown as (v: unknown) => {
                      where: (c: unknown) => Promise<unknown>;
                    }
                  )({ referralCode: code, updatedAt: new Date() }).where(
                    eq(schema.user.id, userId),
                  );
                  break;
                } catch {
                  continue;
                }
              }
            } catch {
              // best-effort: referral code generation failure must not block signup
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
