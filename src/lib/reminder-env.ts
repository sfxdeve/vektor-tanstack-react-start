/**
 * Shared env resolution for reminder / dev-mailbox routes.
 * Centralizes the `cfEnv + process.env` merge that was duplicated
 * across 3 route modules. Keeps the list of keys explicit per caller
 * so we don't accidentally leak secrets.
 */
import { env as cfEnv } from "cloudflare:workers";

const REMINDER_ENV_KEYS = [
  "DEV_MAILBOX",
  "APP_URL",
  "FRONTEND_URL",
  "RESEND_API_KEY",
  "SENDER_EMAIL",
  "SENDER_NAME",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
] as const;

const MAILBOX_ENV_KEYS = ["DEV_MAILBOX", "APP_URL", "RESEND_API_KEY"] as const;

function mergeEnv(keys: readonly string[]): Record<string, string | undefined> {
  const cf = (cfEnv as unknown as Record<string, string | undefined>) ?? {};
  const merged: Record<string, string | undefined> = { ...cf };
  if (typeof process !== "undefined" && process.env) {
    for (const k of keys) {
      if (!merged[k] && process.env[k]) merged[k] = process.env[k];
    }
  }
  return merged;
}

/** Env for reminder sweep / test routes — includes RESEND + sender + APP_URL. */
export function getReminderEnv(): Record<string, string | undefined> {
  return mergeEnv(REMINDER_ENV_KEYS);
}

/** Env for dev mailbox route — minimal set. */
export function getMailboxEnv(): Record<string, string | undefined> {
  return mergeEnv(MAILBOX_ENV_KEYS);
}

/** True when DEV_MAILBOX=1 (capture mode). Strict — does not check DEV_AI_STUB. */
export function isDevMailboxEnv(env: Record<string, string | undefined>): boolean {
  return env.DEV_MAILBOX === "1" || process.env.DEV_MAILBOX === "1";
}

/** Whether the request is from localhost (127.0.0.1 or localhost). Kept only for local e2e fallback. */
export function isLocalhost(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}
