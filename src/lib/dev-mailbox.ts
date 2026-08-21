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

/**
 * Normalize a loose payload (posted to /api/dev/mailbox) into a CapturedEmail.
 */
export function captureRawEmail(raw: unknown): CapturedEmail {
  const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  // Try to normalize common shapes
  const obj = (raw ?? {}) as Record<string, unknown>;
  const entry: CapturedEmail = {
    id,
    to: (obj.to as string | string[]) ?? (obj.email as string) ?? "unknown",
    from: (obj.from as string) ?? "unknown",
    subject: (obj.subject as string) ?? (obj.type as string) ?? "captured",
    html: (obj.html as string) ?? JSON.stringify(raw),
    type: obj.type as string | undefined,
    threshold: obj.threshold as number | undefined,
    companyName: obj.companyName as string | undefined,
    docType: obj.docType as string | undefined,
    docFile: obj.docFile as string | undefined,
    expiryDate: obj.expiryDate as string | undefined,
    createdAt: now,
    resendId: id,
    raw,
  };
  captureEmail(entry);
  return entry;
}
