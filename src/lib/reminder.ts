/**
 * Compliance Guardian — reminder email domain logic
 * Ported verbatim from backend/reminder_service.py
 * Sends idempotent expiry reminders via Resend (fetch to api.resend.com)
 * Thresholds: 30, 7, 0 days before expiry
 */

import { and, eq, isNotNull } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";

import { captureEmail } from "./dev-mailbox";
import { buildEmailHtml, DOC_TYPE_LABEL, subjectSuffix } from "./reminder-template";

export const REMINDER_THRESHOLDS = [30, 7, 0] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

// ---------- Env helpers (env comes straight from the Worker binding) ----------

export function getAppUrl(env: Record<string, string | undefined>): string {
  const raw = (
    env.APP_URL ||
    env.FRONTEND_URL ||
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    ""
  ).trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function getSender(env: Record<string, string | undefined>): string {
  const emailFrom = (env.EMAIL_FROM || "").trim().replace(/^"+|"+$/g, "");
  if (emailFrom) return emailFrom;

  const rawEmail = (env.SENDER_EMAIL || "").trim().replace(/^"+|"+$/g, "");
  const rawName = (env.SENDER_NAME || "").trim().replace(/^"+|"+$/g, "");

  const isDev = env.DEV_MAILBOX === "1" || process.env.DEV_MAILBOX === "1";

  const effectiveEmail = rawEmail || (isDev ? "onboarding@resend.dev" : "no-reply@vektorhq.co.za");
  const effectiveName = rawName || "Vektor";

  if (effectiveName) return `${effectiveName} <${effectiveEmail}>`;
  return effectiveEmail;
}

export function getResendApiKey(env: Record<string, string | undefined>): string {
  return (env.RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim();
}

export function isDevMailbox(env: Record<string, string | undefined>): boolean {
  return env.DEV_MAILBOX === "1" || process.env.DEV_MAILBOX === "1";
}

// ---------- Threshold selection (single source of truth) ----------

/**
 * Pick the tightest applicable reminder threshold for a document.
 * Window semantics (<=0, <=7, <=30) match the original Python
 * `reminder_service.sweep_and_send` — each threshold has its own
 * idempotency row, so a doc fires 30 → 7 → 0 over time and we
 * backfill if the exact day was missed.
 * Spec wording "exactly 30/7/0" describes the threshold values,
 * not an exact-day-only fire. Centralized here to eliminate the
 * 5-site duplicated if-cascade the review flagged.
 */
export function pickThreshold(days: number | null): ReminderThreshold | null {
  if (days === null) return null;
  if (days <= 0) return 0;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  return null;
}

// ---------- Days until ----------

export function daysUntil(
  expiryDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiryDate) return null;
  try {
    let dt: Date;
    if (expiryDate instanceof Date) {
      dt = expiryDate;
    } else {
      const raw = String(expiryDate).trim();
      if (!raw) return null;
      // Handle YYYY-MM-DD without timezone — treat as UTC midnight
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        dt = new Date(raw + "T00:00:00.000Z");
      } else {
        dt = new Date(raw.replace("Z", "+00:00"));
      }
      if (Number.isNaN(dt.getTime())) return null;
    }
    const nowMs = now.getTime();
    const diffMs = dt.getTime() - nowMs;
    // Python's (dt - now).days truncates toward -inf, equivalent to floor division
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return days;
  } catch {
    return null;
  }
}

// ---------- Resend send ----------

export class EmailNotConfiguredError extends Error {}
export class EmailSendError extends Error {}

export async function sendViaResend(
  env: Record<string, string | undefined>,
  toEmail: string,
  subject: string,
  html: string,
  opts?: {
    threshold?: number;
    companyName?: string;
    docType?: string;
    docFile?: string;
    expiryDate?: string;
    companyId?: string;
    documentId?: string;
  },
): Promise<string> {
  if (isDevMailbox(env)) {
    const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const from = getSender(env);
    const appUrl = getAppUrl(env);
    captureEmail({
      id,
      to: toEmail,
      from,
      subject,
      html,
      type: "reminder",
      threshold: opts?.threshold,
      companyId: opts?.companyId,
      documentId: opts?.documentId,
      companyName: opts?.companyName,
      docType: opts?.docType,
      docFile: opts?.docFile,
      expiryDate: opts?.expiryDate,
      createdAt: new Date().toISOString(),
      resendId: id,
      raw: { to: toEmail, from, subject, html, appUrl, threshold: opts?.threshold },
    });
    return id;
  }

  const apiKey = getResendApiKey(env);
  if (!apiKey) {
    throw new EmailNotConfiguredError("RESEND_API_KEY not set");
  }

  const from = getSender(env);
  const supportEmail =
    (env.SUPPORT_EMAIL || "support@vektorhq.co.za").trim().replace(/^"+|"+$/g, "") ||
    "support@vektorhq.co.za";

  const body: Record<string, unknown> = {
    from,
    to: [toEmail],
    subject,
    html,
    reply_to: supportEmail,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new EmailSendError(`Resend failed ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const msgId = (json.id as string) || (json.messageId as string) || "";
  if (!msgId) {
    throw new EmailSendError("Resend returned no message id");
  }
  return msgId;
}

// ---------- Send one reminder ----------

export interface SendReminderResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  to?: string;
  resendId?: string | null;
  threshold?: number;
  error?: string | null;
  sentAt?: string;
}

export async function sendDocumentReminder(
  db: ReturnType<typeof createDb>,
  env: Record<string, string | undefined>,
  company: {
    id: string;
    companyName: string;
    contactEmail?: string | null;
    alertsEnabled?: boolean | null;
  },
  document: {
    id: string;
    docType: string;
    fileName: string;
    expiryDate: Date | string | null;
    isCompliant?: boolean | null;
  },
  threshold: number,
  force = false,
): Promise<SendReminderResult> {
  const toEmail = (company.contactEmail || "").trim();
  if (!toEmail) {
    return { status: "skipped", reason: "no contact_email on company" };
  }

  // If document has no expiry, skip
  if (!document.expiryDate) {
    return { status: "skipped", reason: "no expiry_date on document" };
  }

  // Eligibility via isCompliant — treat false as ineligible for reminders
  // This ensures vault expiry state drives reminder eligibility
  if (document.isCompliant === false) {
    return { status: "skipped", reason: "document not compliant" };
  }

  const companyId = company.id;
  const documentId = document.id;

  if (!force) {
    // Idempotency: one row per (company, document, threshold).
    const existing = await db
      .select()
      .from(sentReminders)
      .where(
        and(
          eq(sentReminders.companyId, companyId),
          eq(sentReminders.documentId, documentId),
          eq(sentReminders.threshold, threshold),
        ),
      );
    if (existing[0]) {
      const row = existing[0];
      return {
        status: "skipped",
        reason: "already sent",
        sentAt: new Date(row.sentAt).toISOString(),
        threshold,
      };
    }
  }

  const docLabel = DOC_TYPE_LABEL[document.docType] ?? document.docType;
  const suffix = subjectSuffix(threshold);
  const subject = `[Vektor] ${docLabel} · ${suffix}`;

  // Format expiry for HTML — handle Date or string
  let expiryIso: string;
  if (document.expiryDate instanceof Date) {
    expiryIso = document.expiryDate.toISOString().slice(0, 10);
  } else {
    const d = new Date(String(document.expiryDate).replace("Z", "+00:00"));
    expiryIso = Number.isNaN(d.getTime())
      ? String(document.expiryDate)
      : d.toISOString().slice(0, 10);
  }

  const appUrl = getAppUrl(env);
  const html = buildEmailHtml({
    companyName: company.companyName || "Bidder",
    docType: document.docType,
    docFile: document.fileName,
    expiryDateIso: expiryIso,
    threshold,
    appUrl,
  });

  let resendId: string | null = null;
  let error: string | null = null;
  try {
    resendId = await sendViaResend(env, toEmail, subject, html, {
      threshold,
      companyName: company.companyName,
      docType: document.docType,
      docFile: document.fileName,
      expiryDate: expiryIso,
      companyId,
      documentId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = msg;
    if (e instanceof EmailNotConfiguredError) {
      return { status: "failed", error, threshold, to: toEmail };
    }
    return { status: "failed", error, threshold, to: toEmail };
  }

  if (!force && resendId) {
    // Record idempotency only on real sends (not force, not failed)
    const now = new Date();
    try {
      await db.insert(sentReminders).values({
        id: crypto.randomUUID(),
        companyId,
        documentId,
        threshold,
        sentAt: now,
        resendId,
        toEmail,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If unique violation, treat as already sent (race)
      if (
        msg.includes("UNIQUE") ||
        msg.toLowerCase().includes("unique") ||
        msg.includes("constraint")
      ) {
        return { status: "skipped", reason: "already sent", threshold };
      }
      // Otherwise log and continue — email was sent, so we should not fail the caller
      console.warn("Failed to insert sent_reminders", e);
    }
  }

  return { status: "sent", to: toEmail, resendId, threshold };
}

// ---------- Sweep ----------

export async function sweepAndSend(
  db: ReturnType<typeof createDb>,
  env: Record<string, string | undefined>,
  now: Date = new Date(),
): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  details: Array<SendReminderResult & { companyId: string; documentId: string; threshold: number }>;
}> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<
    SendReminderResult & { companyId: string; documentId: string; threshold: number }
  > = [];

  const enabledCompanies = await db
    .select()
    .from(companies)
    .where(and(eq(companies.alertsEnabled, true), isNotNull(companies.contactEmail)));

  for (const company of enabledCompanies) {
    if (!company.contactEmail?.trim()) continue;

    const docs = await db
      .select()
      .from(complianceDocuments)
      .where(eq(complianceDocuments.companyId, company.id));

    for (const doc of docs) {
      if (!doc.expiryDate) continue;
      // Skip non-compliant docs — vault state drives eligibility
      if (doc.isCompliant === false) continue;

      const days = daysUntil(doc.expiryDate, now);
      if (days === null) continue;

      const threshold = pickThreshold(days);
      if (threshold === null) continue;

      const result = await sendDocumentReminder(
        db,
        env,
        {
          id: company.id,
          companyName: company.companyName,
          contactEmail: company.contactEmail,
          alertsEnabled: company.alertsEnabled,
        },
        {
          id: doc.id,
          docType: doc.docType,
          fileName: doc.fileName,
          expiryDate: doc.expiryDate as Date,
          isCompliant: doc.isCompliant as boolean,
        },
        threshold,
        false,
      );

      details.push({ ...result, companyId: company.id, documentId: doc.id, threshold });

      if (result.status === "sent") sent++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    }
  }

  return { sent, skipped, failed, details };
}
