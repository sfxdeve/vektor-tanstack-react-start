import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

function cronScheduledPatch() {
  return {
    name: "vektor-cron-scheduled-patch",
    closeBundle: {
      sequential: true,
      async handler() {
        const file = path.resolve("dist/server/index.js");
        if (!fs.existsSync(file)) return;
        const code = fs.readFileSync(file, "utf8");
        if (code.includes("export async function scheduled") || code.includes("export { scheduled"))
          return;

        // Self-contained scheduled handler that mirrors src/lib/reminder.ts sweepAndSend
        // Uses raw D1 prepares so it doesn't need to import drizzle chunks by name.
        const handler = `
export async function scheduled(event, env, ctx) {
  const cron = event?.cron ?? (event?.scheduledTime ? new Date(event.scheduledTime).toISOString() : "0 8 * * *");
  console.log("[cron] scheduled", cron, "08:00 SAST sweep");
  const db = env.DB;
  if (!db) {
    console.warn("[cron] env.DB missing — skipping sweep");
    return;
  }
  const getAppUrl = () => {
    const raw = (env.APP_URL || env.FRONTEND_URL || "").trim();
    if (raw) return raw.replace(/\\/$/, "");
    return "http://localhost:3000";
  };
  const getSender = () => {
    const emailFrom = (env.EMAIL_FROM || "").trim().replace(/^"+|"+$/g, "");
    if (emailFrom) return emailFrom;
    const rawEmail = (env.SENDER_EMAIL || "").trim().replace(/^"+|"+$/g, "");
    const rawName = (env.SENDER_NAME || "").trim().replace(/^"+|"+$/g, "");
    const isDev = env.DEV_MAILBOX === "1";
    const effectiveEmail = rawEmail || (isDev ? "onboarding@resend.dev" : "no-reply@vektorhq.co.za");
    const effectiveName = rawName || "Vektor";
    return effectiveName ? \`\${effectiveName} <\${effectiveEmail}>\` : effectiveEmail;
  };
  const daysUntil = (expiry) => {
    try {
      let dt;
      if (expiry instanceof Date) dt = expiry;
      else if (typeof expiry === "number") dt = new Date(expiry);
      else {
        const raw = String(expiry).trim();
        if (!raw) return null;
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) dt = new Date(raw + "T00:00:00.000Z");
        else if (/^\\d+$/.test(raw)) dt = new Date(Number(raw));
        else dt = new Date(raw.replace("Z", "+00:00"));
        if (Number.isNaN(dt.getTime())) return null;
      }
      return Math.floor((dt.getTime() - Date.now()) / 86400000);
    } catch { return null; }
  };
  const thresholdCopy = (t) => {
    if (t <= 0) return { accent: "#DC2626", badge: "EXPIRED TODAY — INELIGIBLE TO BID", suffix: "expires today" };
    if (t <= 7) return { accent: "#D97706", badge: \`URGENT — \${t} DAYS TO EXPIRY\`, suffix: \`expires in \${t} days\` };
    return { accent: "#0F766E", badge: \`\${t} DAYS TO EXPIRY\`, suffix: \`expires in \${t} days\` };
  };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  try {
    const appUrl = getAppUrl();
    const sender = getSender();
    const apiKey = (env.RESEND_API_KEY || "").trim();
    const isDevMailbox = env.DEV_MAILBOX === "1";
    const companiesRes = await db.prepare("SELECT id, companyName, contactEmail, alertsEnabled FROM companies").all();
    const companies = (companiesRes.results ?? companiesRes) || [];
    let sent = 0, skipped = 0, failed = 0;
    for (const company of companies) {
      if (company.alertsEnabled === 0 || company.alertsEnabled === false) continue;
      const toEmail = (company.contactEmail || "").trim();
      if (!toEmail) continue;
      const docsRes = await db.prepare("SELECT id, docType, fileName, expiryDate, isCompliant, companyId FROM compliance_documents WHERE companyId = ?").bind(company.id).all();
      const docs = (docsRes.results ?? docsRes) || [];
      for (const doc of docs) {
        if (!doc.expiryDate) continue;
        if (doc.isCompliant === 0 || doc.isCompliant === false) continue;
        const days = daysUntil(doc.expiryDate);
        if (days === null) continue;
        let threshold = null;
        if (days <= 0) threshold = 0;
        else if (days <= 7) threshold = 7;
        else if (days <= 30) threshold = 30;
        else continue;
        const existing = await db.prepare("SELECT id FROM sent_reminders WHERE companyId = ? AND documentId = ? AND threshold = ?").bind(company.id, doc.id, threshold).all();
        const rows = existing.results ?? existing;
        const already = Array.isArray(rows) ? rows.length > 0 : !!rows;
        if (already) { skipped++; continue; }
        const labelMap = { TAX_PIN: "Tax Clearance PIN", COIDA: "COIDA Letter of Good Standing", BBBEE: "B-BBEE Certificate / Affidavit", BARGAINING_COUNCIL_GOS: "Bargaining Council Letter of Good Standing", DIRECTOR_ID: "Director ID Copy" };
        const docLabel = labelMap[doc.docType] || doc.docType;
        const { accent, badge, suffix } = thresholdCopy(threshold);
        let expiryIso = "";
        try {
          let d;
          if (typeof doc.expiryDate === "number") d = new Date(doc.expiryDate);
          else d = new Date(String(doc.expiryDate).replace("Z", "+00:00"));
          expiryIso = Number.isNaN(d.getTime()) ? String(doc.expiryDate) : d.toISOString().slice(0,10);
        } catch { expiryIso = String(doc.expiryDate); }
        let expiryPretty = expiryIso;
        try {
          const d = new Date(expiryIso.replace("Z", "+00:00"));
          if (!Number.isNaN(d.getTime())) expiryPretty = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
        } catch {}
        const bodyExtra = threshold <= 0 ? "Once expired, you cannot submit new public tenders — every bid will be rejected on technicality." : "Government tenders reject bids with expired compliance documents. Renew now to protect your pipeline.";
        const html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,&#39;Segoe UI&#39;,Arial,sans-serif;color:#18181b;">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;"><tr><td align="center">' +
          '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">' +
          '<tr><td style="padding:20px 28px;background:#0f172a;color:#f8fafc;"><span style="color:#2dd4bf;">V</span>ektor</td></tr>' +
          '<tr><td style="padding:6px 28px 0 28px;"><div style="display:inline-block;margin-top:20px;padding:4px 10px;background:' + accent + ';color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.15em;border-radius:3px;">' + esc(badge) + '</div></td></tr>' +
          '<tr><td style="padding:12px 28px 4px 28px;"><h1 style="margin:0;font-size:22px;font-weight:800;">Your ' + esc(docLabel) + ' ' + esc(suffix) + '</h1><p>Hi ' + esc(company.companyName) + ',</p><p>Your <strong>' + esc(docLabel) + '</strong> (' + esc(doc.fileName) + ') expires on <strong>' + esc(expiryPretty) + '</strong>. ' + esc(bodyExtra) + '</p></td></tr>' +
          '<tr><td style="padding:20px 28px;"><a href="' + appUrl + '/documents" style="display:inline-block;padding:12px 22px;background:#18181b;color:#ffffff;text-decoration:none;">Renew in Vektor \u2192</a></td></tr>' +
          '</table><p style="font-size:11px;color:#a1a1aa;">Vektor \u00b7 SA Tender Compliance \u00b7 <a href="' + appUrl + '">Open dashboard</a></p></td></tr></table></body></html>';
        const subject = "[Vektor] " + docLabel + " \u00b7 " + (threshold <= 0 ? "EXPIRED \u2014 Ineligible to Bid" : threshold <= 7 ? "URGENT \u2014 7 days to renew" : "Renewal reminder \u2014 30 days");
        let resendId = null;
        if (isDevMailbox) {
          const g = globalThis;
          const key = "__VEKTOR_DEV_MAILBOX__";
          if (!g[key]) g[key] = [];
          resendId = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
          g[key].push({ id: resendId, to: toEmail, from: sender, subject, html, type: "reminder", threshold, companyId: company.id, documentId: doc.id, companyName: company.companyName, docType: doc.docType, docFile: doc.fileName, expiryDate: expiryIso, createdAt: new Date().toISOString(), resendId });
        } else {
          if (!apiKey) { failed++; console.warn("[cron] RESEND_API_KEY not set, skipping", toEmail); continue; }
          try {
            const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "content-type": "application/json" }, body: JSON.stringify({ from: sender, to: [toEmail], subject, html, reply_to: (env.SUPPORT_EMAIL || "support@vektorhq.co.za").trim() }) });
            if (!res.ok) throw new Error("Resend " + res.status + ": " + (await res.text()).slice(0,500));
            const j = await res.json().catch(()=>({}));
            resendId = j.id || j.messageId || "";
            if (!resendId) throw new Error("Resend returned no message id");
          } catch (e) { failed++; console.warn("[cron] send failed", toEmail, e); continue; }
        }
        if (resendId) {
          try {
            await db.prepare("INSERT INTO sent_reminders (id, companyId, documentId, threshold, sentAt, resendId, toEmail) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .bind(crypto.randomUUID(), company.id, doc.id, threshold, Date.now(), resendId, toEmail).run();
            sent++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("UNIQUE") || msg.toLowerCase().includes("unique")) skipped++;
            else { console.warn("[cron] insert sent_reminders failed", e); sent++; }
          }
        }
      }
    }
    console.log("[cron] sweep done", JSON.stringify({ sent, skipped, failed }));
    if (ctx?.waitUntil) ctx.waitUntil(Promise.resolve());
  } catch (e) { console.error("[cron] scheduled failed", e); }
}
`;
        fs.appendFileSync(file, handler, "utf8");
        console.log("[vektor-cron] scheduled handler with sweep injected");
      },
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    cronScheduledPatch(),
  ],
});
