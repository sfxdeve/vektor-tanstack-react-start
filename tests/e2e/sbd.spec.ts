import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureCompanySetup } from "./helpers";
import { pdfFixture } from "./fixtures";

function uniqueEmail(prefix = "sbd") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

test.describe("SBD PDF generation", () => {
  test("SBD 4 and 6.1 downloads succeed and UI exposes them, respects tender ownership", async ({
    page,
  }) => {
    const browser = page.context().browser()!;
    const emailA = uniqueEmail("sbdA");
    const password = "correct-horse-battery-staple-123";
    const emailB = uniqueEmail("sbdB");

    // User A signup
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("SBD User A");
    await page.getByTestId("input-email").fill(emailA);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(emailA.toLowerCase(), {
      timeout: 10000,
    });

    // Create company A with all fields to test field mapping
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("SBD Co A Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(emailA);
    await page.getByTestId("input-cidb-grade").fill("4EB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    const signatoryName = page.getByTestId("input-authorised-signatory-name");
    const signatoryPosition = page.getByTestId("input-authorised-signatory-position");
    await expect(signatoryName).toBeVisible();
    await expect(signatoryPosition).toBeVisible();
    await signatoryName.fill("Jane Doe");
    await signatoryPosition.fill("Director");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Analyze tender
    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("upload-card")).toBeVisible();

    await page.getByTestId("file-input").setInputFiles(pdfFixture("tender-4eb.pdf"));
    await expect(page.getByTestId("selected-file-name")).toContainText("tender-4eb");
    await page.getByTestId("analyze-btn").click();
    await expect(page.getByTestId("results-section")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("fit-score-card")).toBeVisible();

    // UI exposes both SBD download buttons (ephemeral result)
    await expect(page.getByTestId("download-sbd4-btn")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("download-sbd61-btn")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("sbd-downloads")).toBeVisible();
    await expect(page.getByTestId("download-sbd4-btn")).toContainText("SBD 4");
    await expect(page.getByTestId("download-sbd61-btn")).toContainText("SBD 6.1");

    // Persistent per-tender SBD actions — "for any analyzed tender" (survives navigation)
    await expect(page.getByTestId("tender-list-section")).toBeVisible({ timeout: 10000 });
    // Tender list will populate; poll until we can resolve tenderId below

    // Capture tenderId for API verification
    const tenderId = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch(`/api/tenders/${companyId}`);
      const list = (await res.json()) as Array<{ id: string }>;
      return list[0]?.id ?? null;
    });
    expect(tenderId).toBeTruthy();
    // Persistent per-tender actions in Recent Tenders list
    await expect(page.getByTestId(`sbd4-btn-${tenderId}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`sbd61-btn-${tenderId}`)).toBeVisible({ timeout: 10000 });

    // Verify SBD4 download via direct API fetch (no R2 persistence required, ownership respected)
    const sbd4Status = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd4`);
      const ct = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition");
      const buf = await res.arrayBuffer();
      const header = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      return { status: res.status, ct, cd, header, len: buf.byteLength };
    }, tenderId as string);
    expect(sbd4Status.status).toBe(200);
    expect(sbd4Status.ct).toContain("application/pdf");
    expect(sbd4Status.cd).toContain(`SBD4-${tenderId}`);
    expect(sbd4Status.header).toBe("%PDF-");
    expect(sbd4Status.len).toBeGreaterThan(1000);

    const sbd61Status = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd61`);
      const ct = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition");
      const buf = await res.arrayBuffer();
      const header = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      return { status: res.status, ct, cd, header, len: buf.byteLength };
    }, tenderId as string);
    expect(sbd61Status.status).toBe(200);
    expect(sbd61Status.ct).toContain("application/pdf");
    expect(sbd61Status.cd).toContain(`SBD61-${tenderId}`);
    expect(sbd61Status.header).toBe("%PDF-");
    expect(sbd61Status.len).toBeGreaterThan(1000);

    // The analyzed tender also exposes persistent per-tender SBD actions.
    await expect(page.getByTestId(`sbd4-btn-${tenderId}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`sbd61-btn-${tenderId}`)).toBeVisible({ timeout: 10000 });

    // The trial grant is exactly one credit — a second analysis is refused and
    // the credit ledger stays consistent (see tender.spec for the same rule).

    // Ownership isolation: User B cannot download User A's tender SBDs
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("/signup");
    await page.waitForLoadState("networkidle");
    await pageB.getByTestId("input-name").fill("SBD User B");
    await pageB.getByTestId("input-email").fill(emailB);
    await pageB.getByTestId("input-password").fill(password);
    await pageB.getByTestId("submit-signup").click();
    await pageB.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(pageB.getByTestId("user-email")).toContainText(emailB.toLowerCase(), {
      timeout: 10000,
    });
    await ensureCompanySetup(pageB);
    await pageB.getByTestId("input-company-name").fill("SBD Co B Pty Ltd");
    await pageB.getByTestId("input-cipc-num").fill("2022/654321/07");
    await pageB.getByTestId("submit-company-btn").click();
    await expect(pageB.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(pageB.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    const forbidden4 = await pageB.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd4`);
      return res.status;
    }, tenderId as string);
    expect(forbidden4).toBe(403);

    const forbidden61 = await pageB.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd61`);
      return res.status;
    }, tenderId as string);
    expect(forbidden61).toBe(403);

    await contextB.close();

    // Unauthenticated should be 401
    const ctxAnon = await browser.newContext();
    const anonPage = await ctxAnon.newPage();
    await anonPage.goto("/");
    await anonPage.waitForLoadState("networkidle");
    const unauth = await anonPage.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd4`);
      return res.status;
    }, tenderId as string);
    expect(unauth).toBe(401);
    await ctxAnon.close();
  });

  test("analyze page with SBD downloads has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("sbd-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("SBD A11y User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email.toLowerCase(), {
      timeout: 10000,
    });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("SBD A11y Co Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    await page.goto("/analyze");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });

    // Upload and analyze to expose SBD buttons for a11y check
    await page.getByTestId("file-input").setInputFiles(pdfFixture("tender-4eb.pdf"));
    await page.getByTestId("analyze-btn").click();
    await expect(page.getByTestId("results-section")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("download-sbd4-btn")).toBeVisible();
    await expect(page.getByTestId("download-sbd61-btn")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("404 for non-existent tender SBD", async ({ page }) => {
    const email = uniqueEmail("sbd404");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("404 User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email.toLowerCase(), {
      timeout: 10000,
    });

    const fakeId = "00000000-0000-4000-a000-000000000000";
    const s1 = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tender/${id}/sbd4`);
      return r.status;
    }, fakeId);
    expect(s1).toBe(404);
    const s2 = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tender/${id}/sbd61`);
      return r.status;
    }, fakeId);
    expect(s2).toBe(404);
  });
});
