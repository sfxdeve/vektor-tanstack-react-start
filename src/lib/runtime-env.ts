import { env } from "cloudflare:workers";

/** Secrets and vars configured with Wrangler in addition to generated bindings. */
export type RuntimeEnv = Env & {
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  DEV_AI_STUB?: string;
  DEV_MAILBOX?: string;
  OPENAI_API_KEY?: string;
  AI_GATEWAY_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SENDER_EMAIL?: string;
  SENDER_NAME?: string;
  SUPPORT_EMAIL?: string;
};

export const runtimeEnv = env as unknown as RuntimeEnv;

export interface MailEnv {
  APP_URL?: string;
  DEV_MAILBOX?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SENDER_EMAIL?: string;
  SENDER_NAME?: string;
  SUPPORT_EMAIL?: string;
}
