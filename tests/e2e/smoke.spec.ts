import { expect, test } from "@playwright/test";

import { ensureCompanySetup } from "./helpers";

/**
 * Issue 11 — big-bang preview smoke.
 *
 * One serial journey exercising the full vertical chain end to end:
 *   tender analysis (DEV_AI_STUB fixture) → SBD 4 / SBD 6.1 downloads →
 *   EFT request + proof upload → admin confirm (idempotent, grants credits)
 *   → referral reward → dashboard activity feed → reminder sweep idempotency.
 *
 * Runs against `vite preview` locally (.dev.vars provides DEV_AI_STUB=1 +
 * DEV_MAILBOX=1) and against a `wrangler versions upload` preview when
 * SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD point at an operator-seeded remote
 * admin account (the dev role endpoint is disabled outside localhost).
 */

function uniqueEmail(prefix = "smoke") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`.toLowerCase();
}

const PASSWORD = "correct-horse-battery-staple-123";

async function signUp(
  page: import("@playwright/test").Page,
  name: string,
  email: string,
  refCode?: string,
): Promise<void> {
  await page.goto(refCode ? `/signup?ref=${refCode}` : "/signup");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("signup-form")).toBeVisible({ timeout: 15000 });
  if (refCode) {
    await expect(page.getByTestId("signup-referral-banner")).toBeVisible();
  }
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(PASSWORD);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 20000 });
}

test("preview smoke — full vertical chain", async ({ browser }) => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);

  // --- Referrer ------------------------------------------------------------
  const referrerCtx = await browser.newContext();
  const referrerPage = await referrerCtx.newPage();
  const referrerEmail = uniqueEmail(`smoke-ref-${stamp}`);
  await signUp(referrerPage, "Smoke Referrer", referrerEmail);
  const refCode = await referrerPage.evaluate(async () => {
    const r = await fetch("/api/referrals/my");
    return { ok: r.ok, code: ((await r.json()) as { code: string }).code };
  });
  expect(refCode.ok).toBe(true);
  expect(refCode.code).toMatch(/VEK-[A-Z0-9]{6}/);
  const refCodeStr = refCode.code;
  // The reward only grants once the referrer has a company (ported rule:
  // otherwise it is parked as pending_referrer_company) — set one up now.
  await ensureCompanySetup(referrerPage);
  await referrerPage.getByTestId("input-company-name").fill(`Smoke Ref Co ${stamp} Pty Ltd`);
  await referrerPage.getByTestId("input-cipc-num").fill("2020/123456/07");
  await referrerPage.getByTestId("input-contact-email").fill(referrerEmail);
  await referrerPage.getByTestId("input-cidb-grade").fill("5GB");
  await referrerPage.getByTestId("select-bbbee-level").click();
  await referrerPage.getByRole("option", { name: /Level 1/ }).click();
  await referrerPage.getByTestId("submit-company-btn").click();
  await expect(referrerPage.getByText(/Company profile/)).toBeVisible({ timeout: 15000 });
  // setup auto-redirects to /app ~1.2s after save; wait it out so
  // follow-up navigations never race the router
  await expect(referrerPage.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
  const refStatsBefore = await referrerPage.evaluate(async () => {
    const r = await fetch("/api/referrals/my");
    return (await r.json()) as { credits_earned: number };
  });

  // --- Referee signs up through the referral link ---------------------------
  const userCtx = await browser.newContext();
  const userPage = await userCtx.newPage();
  const userEmail = uniqueEmail(`smoke-user-${stamp}`);
  await signUp(userPage, "Smoke Referee", userEmail, refCodeStr);
  await ensureCompanySetup(userPage);
  await userPage.getByTestId("input-company-name").fill(`Smoke Co ${stamp} Pty Ltd`);
  await userPage.getByTestId("input-cipc-num").fill("2021/123456/07");
  await userPage.getByTestId("input-contact-email").fill(userEmail);
  await userPage.getByTestId("input-cidb-grade").fill("4EB");
  await userPage.getByTestId("select-bbbee-level").click();
  await userPage.getByRole("option", { name: /Level 1/ }).click();
  await userPage.getByTestId("submit-company-btn").click();
  await expect(userPage.getByText(/Company profile/)).toBeVisible({ timeout: 15000 });
  // setup auto-redirects to /app ~1.2s after save; wait it out so
  // follow-up navigations never race the router
  await expect(userPage.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

  const companyId = await userPage.evaluate(async () => {
    const comps = (await (await fetch("/api/companies")).json()) as Array<{ id: string }>;
    return comps[0]!.id;
  });
  const creditsBefore = await userPage.evaluate(async (cid) => {
    const r = await fetch(`/api/billing/credits/${cid}`);
    return ((await r.json()) as { credits: number }).credits;
  }, companyId);

  // --- Tender analysis (DEV_AI_STUB deterministic fixture) ------------------
  await userPage.goto("/analyze");
  await userPage.waitForLoadState("networkidle");
  await expect(userPage.getByTestId("upload-card")).toBeVisible({ timeout: 15000 });
  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<<>>\nstream\nTender document: required CIDB 4EB for electrical works\nendstream\nendobj\n",
  );
  await userPage.getByTestId("file-input").setInputFiles({
    name: "smoke-tender.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await expect(userPage.getByTestId("selected-file-name")).toContainText("smoke-tender.pdf");
  await userPage.getByTestId("analyze-btn").click();
  await expect(userPage.getByTestId("results-section")).toBeVisible({ timeout: 20000 });
  await expect(userPage.getByTestId("verdict-label")).toContainText(/GO|CAUTION|NO-GO/);

  // --- SBD 4 and SBD 6.1 downloads ------------------------------------------
  await expect(userPage.getByTestId("download-sbd4-btn")).toBeVisible({ timeout: 10000 });
  await expect(userPage.getByTestId("download-sbd61-btn")).toBeVisible({ timeout: 10000 });
  const [download4] = await Promise.all([
    userPage.waitForEvent("download", { timeout: 15000 }),
    userPage.getByTestId("download-sbd4-btn").click(),
  ]);
  expect(download4.suggestedFilename()).toMatch(/^SBD4.*\.pdf$/);
  const [download61] = await Promise.all([
    userPage.waitForEvent("download", { timeout: 15000 }),
    userPage.getByTestId("download-sbd61-btn").click(),
  ]);
  expect(download61.suggestedFilename()).toMatch(/^SBD61.*\.pdf$/);
  // Per-tender persistent actions serve valid PDF bytes for the analyzed tender
  const tenderId = await userPage.evaluate(async () => {
    const comps = (await (await fetch("/api/companies")).json()) as Array<{ id: string }>;
    const list = (await (await fetch(`/api/tenders/${comps[0]!.id}`)).json()) as Array<{
      id: string;
    }>;
    return list[0]!.id;
  });
  const sbdProbe = await userPage.evaluate(async (tid) => {
    const res = await fetch(`/api/tender/${tid}/sbd4`);
    const buf = await res.arrayBuffer();
    return {
      status: res.status,
      ct: res.headers.get("content-type") ?? "",
      head: new TextDecoder().decode(new Uint8Array(buf).slice(0, 5)),
    };
  }, tenderId);
  expect(sbdProbe.status).toBe(200);
  expect(sbdProbe.ct).toContain("application/pdf");
  expect(sbdProbe.head).toBe("%PDF-");

  // --- EFT request for a Pro subscription + proof upload --------------------
  await userPage.goto("/billing");
  await userPage.waitForLoadState("networkidle");
  await expect(userPage.getByTestId("billing-title")).toBeVisible({ timeout: 15000 });
  await userPage.getByTestId("subscribe-tc_pro_monthly_v2").click();
  await expect(userPage.getByTestId("eft-payment-dialog")).toBeVisible({ timeout: 15000 });
  await expect(userPage.getByTestId("eft-creating")).toBeHidden({ timeout: 15000 });
  const eftRefText = await userPage.getByTestId("eft-reference").textContent();
  expect(eftRefText).toMatch(/VEK-[A-Z0-9]{6}/);
  const eftReference = eftRefText!.trim();
  await expect(userPage.getByTestId("eft-bank-name")).toContainText("First National Bank");
  const proofPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const [uploadResp] = await Promise.all([
    userPage.waitForResponse(
      (resp) => resp.url().includes("/api/eft/upload-proof/") && resp.request().method() === "POST",
      { timeout: 15000 },
    ),
    userPage.getByTestId("eft-proof-file-input").setInputFiles({
      name: "smoke-proof.png",
      mimeType: "image/png",
      buffer: proofPng,
    }),
  ]);
  expect(uploadResp.ok()).toBe(true);
  await expect(userPage.getByTestId("eft-submitted-status")).toContainText("pending_review", {
    timeout: 10000,
  });
  const paymentId = await userPage.evaluate(async (ref: string) => {
    const r = await fetch("/api/eft/my-requests");
    const data = (await r.json()) as { payments: Array<{ id: string; reference: string }> };
    return data.payments.find((p) => p.reference === ref)?.id ?? null;
  }, eftReference);
  expect(paymentId).toBeTruthy();

  // --- Admin confirms the payment ------------------------------------------
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
  const effectiveAdminEmail = adminEmail ?? uniqueEmail(`smoke-admin-${stamp}`);
  const effectiveAdminPassword = adminPassword ?? PASSWORD;
  if (!adminEmail || !adminPassword) {
    // Local path: create an admin via the dev-only role endpoint (localhost-gated).
    // Signup happens in a throwaway context so the admin login below starts from
    // a fresh, unauthenticated /login — no SPA navigation races (flaky on webkit).
    const throwaway = await browser.newContext();
    const tp = await throwaway.newPage();
    await signUp(tp, "Smoke Admin", effectiveAdminEmail);
    const promoteStatus = await tp.evaluate(async (em: string) => {
      const r = await fetch("/api/dev/set-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em, role: "admin" }),
      });
      return r.status;
    }, effectiveAdminEmail);
    expect(promoteStatus).toBe(200);
    await throwaway.close();
  }
  // Deterministic admin login (fresh context, unauthenticated)
  await adminPage.goto("/login");
  await adminPage.waitForLoadState("networkidle");
  await expect(adminPage.getByTestId("login-form")).toBeVisible({ timeout: 15000 });
  await adminPage.getByTestId("input-email").fill(effectiveAdminEmail);
  await adminPage.getByTestId("input-password").fill(effectiveAdminPassword);
  await adminPage.getByTestId("submit-login").click();
  await expect(adminPage).toHaveURL(/\/admin/, { timeout: 20000 });

  // Idempotent confirm: two calls, both succeed, credits granted once
  const confirmResults = [];
  for (let i = 0; i < 2; i++) {
    const confirmRes = await adminPage.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      const body = (await r.json().catch(() => null)) as { status?: string } | null;
      return { ok: r.ok, status: body?.status ?? null };
    }, paymentId!);
    confirmResults.push(confirmRes);
    expect(confirmRes.ok).toBe(true);
    expect(confirmRes.status).toBe("confirmed");
  }
  void confirmResults;

  // Admin sees the confirmed row under the confirmed filter
  await adminPage.goto("/admin/eft");
  await adminPage.waitForLoadState("networkidle");
  await expect(adminPage.getByTestId("admin-eft-filters")).toBeVisible({ timeout: 15000 });
  {
    const waitResp = adminPage.waitForResponse(
      (resp) =>
        resp.url().includes("/api/eft/admin/all") &&
        resp.url().includes("status=confirmed") &&
        resp.request().method() === "GET",
      { timeout: 15000 },
    );
    await adminPage.getByTestId("admin-eft-filter-confirmed").click();
    await waitResp;
  }
  await expect(adminPage.getByTestId(`admin-eft-row-${paymentId}`)).toContainText("Confirmed", {
    timeout: 10000,
  });

  // --- Credits granted to the referee ---------------------------------------
  const creditsAfter = await userPage.evaluate(async (cid) => {
    const r = await fetch(`/api/billing/credits/${cid}`);
    return ((await r.json()) as { credits: number }).credits;
  }, companyId);
  expect(creditsAfter).toBeGreaterThan(creditsBefore);

  // --- Referral reward on first paid subscription confirmation --------------
  const refStatsAfter = await referrerPage.evaluate(async () => {
    const r = await fetch("/api/referrals/my");
    return (await r.json()) as { credits_earned: number };
  });
  // tc_pro_monthly_v2 → 5 reward credits for the referrer
  expect(refStatsAfter.credits_earned).toBe(refStatsBefore.credits_earned + 5);
  const refActivity = await referrerPage.evaluate(async () => {
    const r = await fetch("/api/dashboard/activity?type=referral_reward");
    return (await r.json()) as { items: Array<{ type: string; credits_granted: number }> };
  });
  expect(
    refActivity.items.some((i) => i.type === "referral_reward" && i.credits_granted === 5),
  ).toBe(true);

  // --- Unified dashboard feed merges streams (no starving) ------------------
  await userPage.goto("/app");
  await userPage.waitForLoadState("networkidle");
  await expect(userPage.getByTestId("recent-activity-panel")).toBeVisible({ timeout: 15000 });
  await expect(userPage.locator('[data-testid^="activity-item-tender-"]').first()).toBeVisible({
    timeout: 15000,
  });
  await expect(userPage.locator('[data-testid^="activity-item-eft-"]').first()).toBeVisible({
    timeout: 15000,
  });

  // --- Reminder sweep idempotency -------------------------------------------
  // Upload a compliance document expiring in exactly 7 days via API
  const expiry7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const uploadDoc = await userPage.evaluate(
    async ({ cid, exp, em }: { cid: string; exp: string; em: string }) => {
      const fd = new FormData();
      const blob = new Blob([`Valid until ${exp}\nTax clearance mock.\n`], {
        type: "application/pdf",
      });
      fd.append("file", blob, "smoke-tax.pdf");
      fd.append("doc_type", "TAX_PIN");
      fd.append("expiry_date", exp);
      fd.append("company_id", cid);
      fd.append("contact_email", em);
      const r = await fetch("/api/documents/upload", { method: "POST", body: fd });
      return r.status;
    },
    { cid: companyId, exp: expiry7, em: userEmail },
  );
  expect([200, 201]).toContain(uploadDoc);

  // First sweep sends the 7-day reminder for our document (admin session)
  const sweep1Json = await adminPage.evaluate(async () => {
    const r = await fetch("/api/reminders/sweep", { method: "POST" });
    return {
      ok: r.ok,
      body: (await r.json()) as {
        sent: number;
        details: Array<{ companyId: string; threshold: number; status: string }>;
      },
    };
  });
  expect(sweep1Json.ok).toBe(true);
  const ours1 = sweep1Json.body.details.filter(
    (d) => d.companyId === companyId && d.threshold === 7 && d.status === "sent",
  );
  expect(ours1.length).toBe(1);

  // Second sweep does not duplicate (per-(company, document, threshold) idempotency)
  const sweep2Json = await adminPage.evaluate(async () => {
    const r = await fetch("/api/reminders/sweep", { method: "POST" });
    return {
      ok: r.ok,
      body: (await r.json()) as {
        sent: number;
        details: Array<{ companyId: string; threshold: number; status: string }>;
      },
    };
  });
  expect(sweep2Json.ok).toBe(true);
  const ours2 = sweep2Json.body.details.filter(
    (d) => d.companyId === companyId && d.threshold === 7 && d.status === "sent",
  );
  expect(ours2.length).toBe(0);

  await adminCtx.close();
  await userCtx.close();
  await referrerCtx.close();
});
