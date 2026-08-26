import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureCompanySetup } from "./helpers";
import { makePdf, pdfFixture } from "./fixtures";

function uniqueEmail(prefix = "tender") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

test.describe("Tender Analysis Core", () => {
  test("upload → stubbed AI → score/risk/verdict → returnables toggle → ownership isolation", async ({
    page,
  }) => {
    const emailA = uniqueEmail("tenderA");
    const password = "correct-horse-battery-staple-123";
    const emailB = uniqueEmail("tenderB");

    // Sign up User A
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("Tender User A");
    await page.getByTestId("input-email").fill(emailA);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(emailA.toLowerCase(), {
      timeout: 10000,
    });

    // Create company A
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("TenderCo A Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(emailA);
    await page.getByTestId("input-cidb-grade").fill("4EB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Go to analyze
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("upload-card")).toBeVisible();
    await expect(page.getByTestId("select-pppfa-system")).toBeVisible();

    // Real PDF with CIDB token 4EB — extraction runs through unpdf in workerd.
    await page.getByTestId("file-input").setInputFiles(pdfFixture("tender-4eb.pdf"));
    await expect(page.getByTestId("selected-file-name")).toContainText("tender-4eb");

    await page.getByTestId("analyze-btn").click();
    await expect(page.getByTestId("results-section")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("credits-balance")).toHaveText("0");
    await expect(page.getByTestId("fit-score-card")).toBeVisible();
    await expect(page.getByTestId("gonogo-gauge")).toBeVisible();
    await expect(page.getByTestId("verdict-label")).toBeVisible();
    const verdictText = await page.getByTestId("verdict-label").innerText();
    expect(["GO", "CAUTION", "NO-GO"]).toContain(verdictText.trim());

    // B-BBEE points should be 20 for Level 1 with 80/20
    await expect(page.getByTestId("bbbee-points-value")).toContainText("20");
    // Fit score value
    await expect(page.getByTestId("fit-score-value")).toBeVisible();
    // Risk flags list should be present (at least bargaining or tax etc)
    // For this company we have no TAX/COIDA docs, so risk flags should be visible
    await expect(page.getByTestId("risk-flags-card")).toBeVisible();
    // Check that risk flags count is >0
    const riskCount = await page.getByTestId("risk-flags-count").innerText();
    expect(Number(riskCount.trim())).toBeGreaterThan(0);

    // Returnables checklist
    await expect(page.getByTestId("returnables-card")).toBeVisible();
    await expect(page.getByTestId("returnables-list")).toBeVisible();
    const firstToggle = page.locator('[data-testid^="returnable-toggle-"]').first();
    await expect(firstToggle).toBeVisible();
    const wasChecked = await firstToggle.isChecked();
    await firstToggle.click();
    // Wait for toggle to persist
    await expect(firstToggle).toBeChecked({ checked: !wasChecked, timeout: 5000 });
    // Toggle back
    await firstToggle.click();
    await expect(firstToggle).toBeChecked({ checked: wasChecked, timeout: 5000 });

    // Capture tender_id for isolation test
    const tenderId = await page.evaluate(async () => {
      // fetch tenders list for current company
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch(`/api/tenders/${companyId}`);
      const list = (await res.json()) as Array<{ id: string }>;
      return list[0]?.id ?? null;
    });
    expect(tenderId).toBeTruthy();

    // Sign up User B and verify isolation
    // Need to log out first: use sidebar logout? Or directly navigate to signup and create new user in same browser will replace session
    // We'll create a new page context for user B
    const contextB = await page.context().browser()!.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("/signup");
    await page.waitForLoadState("networkidle");
    await pageB.getByTestId("input-name").fill("Tender User B");
    await pageB.getByTestId("input-email").fill(emailB);
    await pageB.getByTestId("input-password").fill(password);
    await pageB.getByTestId("submit-signup").click();
    await pageB.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(pageB.getByTestId("user-email")).toContainText(emailB.toLowerCase(), {
      timeout: 10000,
    });

    await ensureCompanySetup(pageB);
    await pageB.getByTestId("input-company-name").fill("TenderCo B Pty Ltd");
    await pageB.getByTestId("input-cipc-num").fill("2022/654321/07");
    await pageB.getByTestId("submit-company-btn").click();
    await expect(pageB.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(pageB.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Try to fetch User A's tender as User B — should be 403
    const status = await pageB.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}`);
      return res.status;
    }, tenderId as string);
    expect(status).toBe(403);

    // Also list with User A's companyId should be 403
    const companyAId = await page.evaluate(async () => {
      const res = await fetch("/api/companies");
      const list = (await res.json()) as Array<{ id: string; company_name: string }>;
      return list.find((c) => c.company_name.includes("TenderCo A"))?.id ?? null;
    });
    const listStatus = await pageB.evaluate(async (cid) => {
      const res = await fetch(`/api/tenders/${cid}`);
      return res.status;
    }, companyAId as string);
    expect(listStatus).toBe(403);

    await contextB.close();

    // Verify that uploading a non-PDF fails with appropriate error
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");
    const badBuffer = Buffer.from("not a pdf content");
    await page.getByTestId("file-input").setInputFiles({
      name: "tender.txt",
      mimeType: "text/plain",
      buffer: badBuffer,
    });
    await expect(page.getByText("Only PDF files are supported")).toBeVisible();
    await expect(page.getByTestId("file-input")).toHaveValue("");
    await expect(page.getByTestId("analyze-btn")).toBeDisabled();
  });

  test("analyze page has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("tender-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("A11y Tender User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email.toLowerCase(), {
      timeout: 10000,
    });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("A11y TenderCo Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("credit consumption refund on failure - invalid pdf handling", async ({ page }) => {
    const email = uniqueEmail("tender-credit");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("Credit User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    // ensure session loaded
    await expect(page.getByTestId("user-email")).toContainText(email.toLowerCase(), {
      timeout: 10000,
    });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("CreditCo Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    const companyId = await page.evaluate(async () => {
      const companies = (await (await fetch("/api/companies")).json()) as Array<{ id: string }>;
      return companies[0]!.id;
    });
    const balanceBefore = await page.evaluate(async (id) => {
      return ((await (await fetch(`/api/billing/credits/${id}`)).json()) as { credits: number })
        .credits;
    }, companyId);
    expect(balanceBefore).toBe(1);

    const failurePdf = await makePdf("ai-failure.pdf", ["VEKTOR_TEST_AI_FAILURE"]);
    const failed = await page.request.post("/api/tenders/analyze", {
      multipart: {
        file: failurePdf,
        company_id: companyId,
        preference_system: "80/20",
      },
    });
    expect(failed.status()).toBe(502);
    expect(((await failed.json()) as { detail: string }).detail).toMatch(
      /credit has been refunded/i,
    );
    const balanceAfterFailure = await page.evaluate(async (id) => {
      return ((await (await fetch(`/api/billing/credits/${id}`)).json()) as { credits: number })
        .credits;
    }, companyId);
    expect(balanceAfterFailure).toBe(1);

    const success = await page.request.post("/api/tenders/analyze", {
      multipart: {
        file: pdfFixture("tender-4eb.pdf"),
        company_id: companyId,
        preference_system: "80/20",
      },
    });
    expect(success.status()).toBe(200);
    const analyzed = (await success.json()) as { tender_id: string };

    const download = await page.request.get(`/api/tenders/download/${analyzed.tender_id}`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toContain("application/pdf");
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const range = await page.request.get(`/api/tenders/download/${analyzed.tender_id}`, {
      headers: { Range: "bytes=0-4" },
    });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-range"]).toMatch(/^bytes 0-4\/\d+$/);
    expect((await range.body()).toString()).toBe("%PDF-");
  });
});
