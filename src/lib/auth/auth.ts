import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
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
    emailAndPassword: {
      enabled: true,
    },
    secret: options?.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL: options?.baseURL ?? process.env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
