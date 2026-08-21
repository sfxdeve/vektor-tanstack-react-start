/**
 * Reminder email template — threshold-specific accent/banner + HTML.
 * Extracted from reminder.ts to isolate presentation from transport/DB.
 * See ADR: template lives here, transport + sweep live in reminder.ts.
 */

export const DOC_TYPE_LABEL: Record<string, string> = {
  TAX_PIN: "Tax Clearance PIN",
  COIDA: "COIDA Letter of Good Standing",
  BBBEE: "B-BBEE Certificate / Affidavit",
  BARGAINING_COUNCIL_GOS: "Bargaining Council Letter of Good Standing",
  DIRECTOR_ID: "Director ID Copy",
};

export type DocType = keyof typeof DOC_TYPE_LABEL | (string & {});

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

export function subjectSuffix(threshold: number): string {
  if (threshold <= 0) return "EXPIRED — Ineligible to Bid";
  if (threshold <= 7) return "URGENT — 7 days to renew";
  return "Renewal reminder — 30 days";
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
