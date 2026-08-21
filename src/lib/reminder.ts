/**
 * Compliance Guardian — reminder email domain logic
 * Ported verbatim from backend/reminder_service.py
 * Sends idempotent expiry reminders via Resend (fetch to api.resend.com)
 * Thresholds: 30, 7, 0 days before expiry
 */

import { and, eq } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";

import { captureEmail } from "./dev-mailbox";

export const REMINDER_THRESHOLDS = [30, 7, 0] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

export const DOC_TYPE_LABEL: Record<string, string> = {
  TAX_PIN: "Tax Clearance PIN",
  COIDA: "COIDA Letter of Good Standing",
  BBBEE: "B-BBEE Certificate / Affidavit",
  BARGAINING_COUNCIL_GOS: "Bargaining Council Letter of Good Standing",
  DIRECTOR_ID: "Director ID Copy",
};

// ---------- Env helpers ----------

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

// ---------- Threshold copy + HTML template ----------

export function thresholdCopy(threshold: number): {
  accent: string;
  badge: string;
  headlineSuffix: string;
} {
  if (threshold <= 0) {
    return {
      accent: "#DC2626",
      badge: "EXPIRED TODAY — INELIGIBLE TO BID",
      headlineSuffix: "expires today",
    };
  }
  if (threshold <= 7) {
    return {
      accent: "#D97706",
      badge: `URGENT — ${threshold} DAYS TO EXPIRY`,
      headlineSuffix: `expires in ${threshold} days`,
    };
  }
  return {
    accent: "#0F766E",
    badge: `${threshold} DAYS TO EXPIRY`,
    headlineSuffix: `expires in ${threshold} days`,
  };
}

export function buildEmailHtml(args: {
  companyName: string;
  docType: string;
  docFile: string;
  expiryDateIso: string;
  threshold: number;
  appUrl: string;
}): string {
  const { companyName, docType, docFile, expiryDateIso, threshold, appUrl } = args;
  const { accent, badge, headlineSuffix } = thresholdCopy(threshold);
  const docLabel = DOC_TYPE_LABEL[docType] ?? docType;

  let expiryPretty = expiryDateIso;
  try {
    const d = new Date(expiryDateIso.replace("Z", "+00:00"));
    if (!Number.isNaN(d.getTime())) {
      expiryPretty = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  } catch {
    expiryPretty = expiryDateIso;
  }

  const bodyExtra =
    threshold <= 0
      ? "Once expired, you cannot submit new public tenders — every bid will be rejected on technicality."
      : "Government tenders reject bids with expired compliance documents. Renew now to protect your pipeline.";

  const safeCompany = escapeHtml(companyName);
  const safeLabel = escapeHtml(docLabel);
  const safeFile = escapeHtml(docFile);
  const safeExpiry = escapeHtml(expiryPretty);

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background:#0f172a;color:#f8fafc;">
              <table width="100%"><tr>
                <td style="font-size:20px;font-weight:800;letter-spacing:-0.01em;">
                  <span style="color:#2dd4bf;">V</span>ektor
                </td>
                <td align="right" style="font-size:10px;letter-spacing:0.15em;color:#94a3b8;text-transform:uppercase;">
                  SA Tender Compliance
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 28px 0 28px;">
              <div style="display:inline-block;margin-top:20px;padding:4px 10px;background:${accent};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.15em;border-radius:3px;">
                ${escapeHtml(badge)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 4px 28px;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;color:#18181b;">
                Your ${safeLabel} ${escapeHtml(headlineSuffix)}
              </h1>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#3f3f46;">
                Hi ${safeCompany},
              </p>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#3f3f46;">
                Your <strong>${safeLabel}</strong> (<code style="background:#f4f4f5;padding:1px 5px;border-radius:3px;font-size:12px;">${safeFile}</code>) expires on <strong>${safeExpiry}</strong>.
                ${escapeHtml(bodyExtra)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;">
              <table cellpadding="0" cellspacing="0"><tr><td style="background:#18181b;border-radius:4px;">
                <a href="${appUrl}/documents" style="display:inline-block;padding:12px 22px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                  Renew in Vektor →
                </a>
              </td></tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
                You're receiving this because <strong>${safeCompany}</strong> enabled Compliance Guardian in Vektor.
                Turn off alerts anytime from Company Setup.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#a1a1aa;">
          Vektor · SA Tender Compliance · <a href="${appUrl}" style="color:#a1a1aa;">Open dashboard</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    // Check idempotency
    const existing = await (
      db.select().from(sentReminders).where as unknown as (
        c: unknown,
      ) => Promise<(typeof sentReminders.$inferSelect)[]>
    )(
      and(
        eq(sentReminders.companyId, companyId),
        eq(sentReminders.documentId, documentId),
        eq(sentReminders.threshold, threshold),
      ),
    );
    if (existing.length > 0) {
      const row = existing[0]!;
      const sentAt = row.sentAt ? new Date(row.sentAt).toISOString() : undefined;
      return { status: "skipped", reason: "already sent", sentAt, threshold };
    }
  }

  const docLabel = DOC_TYPE_LABEL[document.docType] ?? document.docType;
  const subjectSuffix =
    threshold <= 0
      ? "EXPIRED — Ineligible to Bid"
      : threshold <= 7
        ? "URGENT — 7 days to renew"
        : "Renewal reminder — 30 days";
  const subject = `[Vektor] ${docLabel} · ${subjectSuffix}`;

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

  // Fetch all companies where alerts_enabled
  // Note: drizzle boolean handling — filter in JS for simplicity and compatibility
  const allCompanies = await db.select().from(companies);
  const enabledCompanies = allCompanies.filter(
    (c) => c.alertsEnabled !== false && Boolean(c.contactEmail?.trim()),
  );

  for (const company of enabledCompanies) {
    if (!company.contactEmail?.trim()) continue;

    // Fetch docs for this company
    const docs = await (
      db.select().from(complianceDocuments).where as unknown as (
        c: unknown,
      ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
    )(eq(complianceDocuments.companyId, company.id));

    for (const doc of docs) {
      if (!doc.expiryDate) continue;
      // Skip non-compliant docs — vault state drives eligibility
      if (doc.isCompliant === false) continue;

      const days = daysUntil(doc.expiryDate, now);
      if (days === null) continue;

      let threshold: number | null = null;
      if (days <= 0) threshold = 0;
      else if (days <= 7) threshold = 7;
      else if (days <= 30) threshold = 30;
      else continue;

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
