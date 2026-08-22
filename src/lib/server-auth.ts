import { env } from "cloudflare:workers";

import { jsonError } from "@/lib/request-utils";

import { createAuth } from "./auth/auth";

/**
 * Single auth instance bound to the Worker's D1 binding.
 * `env` comes from the cloudflare:workers module (typed via
 * worker-configuration.d.ts), so no casting is needed anywhere.
 */
const auth = createAuth(env.DB);

export type AppSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: "admin" | "user" | null;
    referralCode?: string | null;
    [key: string]: unknown;
  };
  session: {
    id: string;
    impersonatedBy?: string | null;
    [key: string]: unknown;
  };
} | null;

type AuthedSession = Exclude<AppSession, null>;

export async function getSession(request: Request): Promise<AppSession> {
  return (await auth.api.getSession({ headers: request.headers })) as AppSession;
}

/**
 * Route-handler guard: returns the session when authenticated, otherwise a
 * 401 Response the handler can return directly.
 */
export async function requireUser(request: Request): Promise<AuthedSession | Response> {
  const session = await getSession(request);
  if (!session?.user) return jsonError("Not authenticated", 401);
  return session;
}

export function isAdminSession(session: AppSession): boolean {
  return session?.user?.role === "admin";
}

/** True when an admin is currently wearing a user hat (impersonation active). */
export function isImpersonatingSession(session: AppSession): boolean {
  return Boolean(session?.session?.impersonatedBy);
}

/**
 * Admin-route guard: returns the session for a non-impersonating admin,
 * otherwise a 401/403 Response to return directly.
 */
export async function requireAdmin(request: Request): Promise<AuthedSession | Response> {
  const session = await getSession(request);
  if (!session?.user) return jsonError("Not authenticated", 401);
  if (!isAdminSession(session)) return jsonError("Admin access required", 403);
  if (isImpersonatingSession(session)) return jsonError("Admin access required", 403);
  return session;
}

export type { AuthedSession };
