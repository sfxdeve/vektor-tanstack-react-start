/**
 * In-memory dev mailbox — captures outgoing emails when DEV_MAILBOX=1
 * instead of sending via Resend. Stored on globalThis so it survives
 * across requests in the same isolate (workerd).
 */

export interface CapturedEmail {
  id: string;
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  type?: string;
  threshold?: number;
  companyId?: string;
  documentId?: string;
  companyName?: string;
  docType?: string;
  docFile?: string;
  expiryDate?: string;
  createdAt: string;
  resendId?: string;
  raw?: unknown;
}

const GLOBAL_KEY = "__VEKTOR_DEV_MAILBOX__" as const;

type MailboxGlobal = typeof globalThis & Record<typeof GLOBAL_KEY, CapturedEmail[] | undefined>;

function getStore(): CapturedEmail[] {
  const g = globalThis as MailboxGlobal;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = [];
  return g[GLOBAL_KEY]!;
}

export function captureEmail(entry: CapturedEmail): void {
  getStore().push(entry);
}

export function listEmails(): CapturedEmail[] {
  return [...getStore()];
}

export function clearEmails(): void {
  const store = getStore();
  store.length = 0;
}
