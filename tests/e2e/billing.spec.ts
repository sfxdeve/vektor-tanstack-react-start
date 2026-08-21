import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureCompanySetup } from "./helpers";

function uniqueEmail(prefix = "billing") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

test.describe("EFT Billing", () => {
  test("catalog display → request → FNB details → proof upload → status pending_review → my-requests → cancellation", async ({
    page,
  }) => {
    const email = uniqueEmail("billing-e2e");
    const password = "correct-horse-battery-staple-123";

    // Signup
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await page.getByTestId("input-name").fill("Billing E2E User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });

    // Create company
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("Billing E2E Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(email);
    await page.getByTestId("input-cidb-grade").fill("4GB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Go to billing
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("billing-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("current-balance-card")).toBeVisible();
    // Catalog checks
    await expect(page.getByTestId("package-tc_starter_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("package-tc_pro_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("package-tc_scale_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("package-tc_credits_1_v2")).toBeVisible();
    // popular tag on Pro
    await expect(page.getByTestId("popular-badge-tc_pro_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("popular-badge-tc_pro_monthly_v2")).toContainText("Popular");
    // Subscription grid should show R399, R1299, R2499, R149
    await expect(page.getByTestId("package-tc_starter_monthly_v2")).toContainText("R399");
    await expect(page.getByTestId("package-tc_pro_monthly_v2")).toContainText("R1299");
    await expect(page.getByTestId("package-tc_scale_monthly_v2")).toContainText("R2499");
    await expect(page.getByTestId("package-tc_credits_1_v2")).toContainText("R149");
    // No Stripe mention
    await expect(page.locator("body")).not.toContainText("Stripe");
    // Pay by EFT buttons exist
    await expect(page.getByTestId("subscribe-tc_starter_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("subscribe-tc_pro_monthly_v2")).toBeVisible();
    await expect(page.getByTestId("buy-tc_credits_1_v2")).toBeVisible();

    // --- Request EFT for Starter ---
    await page.getByTestId("subscribe-tc_starter_monthly_v2").click();
    await expect(page.getByTestId("eft-payment-dialog")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("eft-creating")).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId("eft-instructions")).toBeVisible();
    const ref = await page.getByTestId("eft-reference").textContent();
    expect(ref).toMatch(/VEK-[A-Z0-9]{6}/);
    await expect(page.getByTestId("eft-amount")).toContainText("R399");
    // FNB details
    await expect(page.getByTestId("eft-bank-name")).toContainText("First National Bank");
    await expect(page.getByTestId("eft-account-holder")).toBeVisible();
    await expect(page.getByTestId("eft-account-number")).toBeVisible();
    await expect(page.getByTestId("eft-branch-code")).toContainText("250655");
    await expect(page.getByTestId("eft-account-type")).toContainText("Cheque");

    // Upload proof (PNG) — wait for upload-proof response
    const proofBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // minimal PNG header
    const [uploadResp] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/eft/upload-proof/") && resp.request().method() === "POST",
        { timeout: 15000 },
      ),
      page.getByTestId("eft-proof-file-input").setInputFiles({
        name: "proof.png",
        mimeType: "image/png",
        buffer: proofBuffer,
      }),
    ]);
    expect(uploadResp.ok()).toBe(true);
    // After upload, should show pending_review submitted view
    await expect(page.getByTestId("eft-submitted")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("eft-submitted-status")).toContainText("pending_review");
    // Close dialog — force due to animation instability, wait for my-requests refresh
    const myReqsPromise = page
      .waitForResponse((resp) => resp.url().includes("/api/eft/my-requests"), { timeout: 15000 })
      .catch(() => null);
    await page.getByTestId("eft-close-btn").click({ force: true });
    await expect(page.getByTestId("eft-payment-dialog")).toBeHidden({ timeout: 5000 });
    await myReqsPromise;

    // My requests list should now show pending_review
    await expect(page.getByTestId("my-eft-payments-section")).toBeVisible({ timeout: 8000 });
    const statusRow = page.locator('[data-testid^="eft-status-"]').first();
    await expect(statusRow).toBeVisible();
    await expect(statusRow).toContainText("Verifying payment");
    const rowId = await statusRow.getAttribute("data-testid");
    const paymentId = rowId?.replace("eft-status-", "") ?? "";
    expect(paymentId).toBeTruthy();
    await expect(page.getByTestId(`eft-row-reference-${paymentId}`)).toContainText(/VEK-/);
    await expect(page.getByTestId(`eft-row-status-${paymentId}`)).toContainText("pending_review");

    // Verify via API: GET /api/eft/my-requests
    const myReqs = await page.evaluate(async () => {
      const r = await fetch("/api/eft/my-requests");
      return (await r.json()) as {
        payments: Array<{ id: string; status: string; reference: string }>;
      };
    });
    expect(myReqs.payments.length).toBeGreaterThanOrEqual(1);
    const created = myReqs.payments.find((p) => p.id === paymentId);
    expect(created).toBeDefined();
    expect(created?.status).toBe("pending_review");

    // Cancellation from pending_review (spec allows pending_review or awaiting_proof)
    await page.getByTestId(`eft-cancel-${paymentId}`).click();
    // After cancel, row should disappear
    await expect(page.getByTestId(`eft-status-${paymentId}`)).toBeHidden({ timeout: 8000 });

    const afterCancel = await page.evaluate(async () => {
      const r = await fetch("/api/eft/my-requests");
      return (await r.json()) as { payments: Array<{ id: string }> };
    });
    expect(afterCancel.payments.find((p) => p.id === paymentId)).toBeUndefined();

    // --- Test awaiting_proof cancellation via direct API (not via dialog orphan handling) ---
    // Create another request directly via API, then cancel via DELETE
    const secondPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_credits_1_v2", company_id: companyId }),
      });
      return (await res.json()) as { id: string; status: string; reference: string };
    });
    expect(secondPayment.status).toBe("awaiting_proof");
    expect(secondPayment.reference).toMatch(/VEK-/);

    // Verify it appears in list
    await page.reload();
    await expect(page.getByTestId("my-eft-payments-section")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId(`eft-status-${secondPayment.id}`)).toBeVisible();
    await expect(page.getByTestId(`eft-status-${secondPayment.id}`)).toContainText(
      "Awaiting proof",
    );

    // Cancel via UI
    await page.getByTestId(`eft-cancel-${secondPayment.id}`).click();
    await expect(page.getByTestId(`eft-status-${secondPayment.id}`)).toBeHidden({ timeout: 8000 });

    // Re-upload after rejection flow: create, upload, admin reject (simulate via direct DB? we'll test via admin API if we can become admin)
    // For now just ensure rejected path allows re-upload: we will manually set status to rejected via admin reject endpoint after creating a fresh payment
    // But we can test that uploading after pending_review still works (already covered) and that rejected allows re-upload — we simulate by creating a payment, uploading proof -> pending_review, then if we had admin, we could reject. Without admin, we test that re-upload from pending_review doesn't error
    const thirdPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_credits_1_v2", company_id: companyId }),
      });
      return (await res.json()) as { id: string };
    });
    // upload proof once
    await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const blob = new Blob([buf], { type: "image/png" });
      const file = new File([blob], "p1.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
    }, thirdPayment.id);
    // upload again (re-upload while pending_review) should succeed
    const reuploadRes = await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
      const blob = new Blob([buf], { type: "image/png" });
      const file = new File([blob], "p2.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
      return {
        ok: r.ok,
        status: r.status,
        body: (await r.json().catch(() => ({}))) as Record<string, unknown>,
      };
    }, thirdPayment.id);
    expect(reuploadRes.ok).toBe(true);
    expect((reuploadRes.body as { status?: string }).status).toBe("pending_review");

    // cleanup: cancel
    await page.evaluate(async (pid: string) => {
      await fetch(`/api/eft/request/${pid}`, { method: "DELETE" });
    }, thirdPayment.id);
  });

  test("billing has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("billing-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("A11y Billing User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("A11y Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("billing-title")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("bank details endpoint returns FNB fields and package catalog is correct via API", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // public catalog check via API without auth
    const catalogRes = await page.request.get("/api/billing/packages");
    expect(catalogRes.ok()).toBe(true);
    const catalog = (await catalogRes.json()) as {
      packages: Array<{
        id: string;
        amount: number;
        credits: number;
        type: string;
        interval: string | null;
        is_popular: boolean;
        billing_period: string;
      }>;
    };
    expect(catalog.packages).toHaveLength(4);
    const starter = catalog.packages.find((p) => p.id === "tc_starter_monthly_v2");
    expect(starter).toMatchObject({
      amount: 399,
      credits: 5,
      type: "subscription",
      interval: "month",
      billing_period: "monthly",
    });
    const pro = catalog.packages.find((p) => p.id === "tc_pro_monthly_v2");
    expect(pro?.is_popular).toBe(true);
    const payg = catalog.packages.find((p) => p.id === "tc_credits_1_v2");
    expect(payg).toMatchObject({
      amount: 149,
      credits: 1,
      type: "one_time",
      billing_period: "one_time",
    });

    const bankRes = await page.request.get("/api/eft/bank-details");
    expect(bankRes.ok()).toBe(true);
    const bank = (await bankRes.json()) as {
      bank_name: string;
      account_holder: string;
      account_number: string;
      branch_code: string;
      account_type: string;
    };
    expect(bank.bank_name.toLowerCase()).toContain("first national");
    expect(bank.account_holder).toBeTruthy();
    expect(bank.account_number).toBeTruthy();
    expect(bank.branch_code).toBeTruthy();
    expect(bank.account_type).toBeTruthy();
  });
});
