import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env as cloudflareEnv } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import * as schema from "@/db/schema";
import { generateReference } from "@/lib/eft";

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
            const d1 = (cloudflareEnv as unknown as { DB?: D1Database }).DB;
            const targetDb = d1 ? createDb(d1 as unknown as D1Database) : db;
            const userId = (createdUser as unknown as { id: string }).id;
            const userEmail = (createdUser as unknown as { email: string }).email;
            // 1) Generate VEK-XXXXXX referral code for every new user, retry on collision.
            try {
              const existing = (createdUser as unknown as { referralCode?: string }).referralCode;
              if (!existing) {
                for (let attempt = 0; attempt < 5; attempt++) {
                  const code = generateReference();
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
              }
            } catch {
              // best-effort: referral code generation failure must not block signup
            }
            // 2) Atomic attribution if signup carried ?ref= via referredByCode (input:true)
            // This makes signup attribution server-side and not dependent on a follow-up client fetch.
            try {
              const rawCode = (createdUser as unknown as { referredByCode?: string })
                .referredByCode;
              const normalized = (rawCode || "").trim().toUpperCase();
              if (!normalized) return;
              // Block self-referral
              const referrerRows = await (
                targetDb.select().from(schema.user).where as unknown as (
                  c: unknown,
                ) => Promise<(typeof schema.user.$inferSelect)[]>
              )(eq(schema.user.referralCode, normalized));
              const referrer = referrerRows[0];
              if (!referrer) return;
              if (referrer.email.toLowerCase() === (userEmail || "").toLowerCase()) return;
              if (referrer.id === userId) return;
              // First-code-wins: check if this user already has a referrer
              const meRows = await (
                targetDb.select().from(schema.user).where as unknown as (
                  c: unknown,
                ) => Promise<(typeof schema.user.$inferSelect)[]>
              )(eq(schema.user.id, userId));
              const me = meRows[0];
              if (!me || me.referredByUserId) return;
              // Check referrals row already exists (idempotency)
              const existingRef = await (
                targetDb.select().from(schema.referrals).where as unknown as (
                  c: unknown,
                ) => Promise<(typeof schema.referrals.$inferSelect)[]>
              )(eq(schema.referrals.refereeUserId, userId));
              if (existingRef.length > 0) return;
              const now = new Date();
              // Update user with referrer linkage
              await (
                targetDb.update(schema.user).set as unknown as (v: unknown) => {
                  where: (c: unknown) => Promise<unknown>;
                }
              )({
                referredByUserId: referrer.id,
                referredByCode: normalized,
                referredAt: now,
                updatedAt: now,
              }).where(eq(schema.user.id, userId));
              // Create audit row - catch unique violation for concurrent claims
              try {
                await targetDb.insert(schema.referrals).values({
                  id: crypto.randomUUID(),
                  referrerUserId: referrer.id,
                  refereeUserId: userId,
                  refereeEmail: (userEmail || "").toLowerCase(),
                  code: normalized,
                  status: "signed_up",
                  signupBonusGranted: false,
                  referrerFirstPaidBonusGranted: false,
                  referrerSubBonusGranted: false,
                  createdAt: now,
                });
              } catch {
                // concurrent first-code-wins: another claim won, ignore
              }
            } catch {
              // best-effort: attribution failure must not block signup
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
