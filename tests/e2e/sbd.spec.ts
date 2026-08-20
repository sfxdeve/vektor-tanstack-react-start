import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    await page.getByTestId("input-name").fill("SBD User A");
    await page.getByTestId("input-email").fill(emailA);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(emailA.toLowerCase(), {
      timeout: 10000,
    });

    // Create company A with all fields to test field mapping
    await page.goto("/setup");
    await expect(page.getByTestId("company-form-card")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-company-name").fill("SBD Co A Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(emailA);
    await page.getByTestId("input-cidb-grade").fill("4EB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    // Try to fill authorised signatory if fields exist (may be behind extra UI)
    const signatoryName = page.getByTestId("input-authorised-name");
    if (await signatoryName.isVisible().catch(() => false)) {
      await signatoryName.fill("Jane Doe");
    }
    const signatoryPos = page.getByTestId("input-authorised-position");
    if (await signatoryPos.isVisible().catch(() => false)) {
      await signatoryPos.fill("Director");
    }
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });

    // Analyze tender
    await page.goto("/analyze");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("upload-card")).toBeVisible();

    const pdfBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nstream\nTender document: required CIDB 4EB for electrical works\nendstream\nendobj\n",
    );
    await page.getByTestId("file-input").setInputFiles({
      name: "tender.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await expect(page.getByTestId("selected-file-name")).toContainText("tender.pdf");
    await page.getByTestId("analyze-btn").click();
    await expect(page.getByTestId("results-section")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("fit-score-card")).toBeVisible();

    // UI exposes both SBD download buttons
    await expect(page.getByTestId("download-sbd4-btn")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("download-sbd61-btn")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("sbd-downloads")).toBeVisible();
    // Buttons have branded styling? Check they are actionable
    await expect(page.getByTestId("download-sbd4-btn")).toContainText("SBD 4");
    await expect(page.getByTestId("download-sbd61-btn")).toContainText("SBD 6.1");

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

    // Check that 90/10 variant would also work if we re-analyze with 90/10 system
    // Do a second analysis with 90/10 to ensure schedule branch is covered
    await page.getByTestId("select-pppfa-system").click();
    await page.getByRole("option", { name: /90\/10/ }).click();
    await page.getByTestId("file-input").setInputFiles({
      name: "tender2.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await page.getByTestId("analyze-btn").click();
    await expect(page.getByTestId("results-section")).toBeVisible({ timeout: 15000 });
    const tenderId2 = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch(`/api/tenders/${companyId}`);
      const list = (await res.json()) as Array<{ id: string }>;
      // newest first
      return list[0]?.id ?? null;
    });
    expect(tenderId2).toBeTruthy();
    const sbd61_90 = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/tender/${tid}/sbd61`);
      const buf = await res.arrayBuffer();
      return {
        status: res.status,
        len: buf.byteLength,
        header: new TextDecoder().decode(new Uint8Array(buf).slice(0, 5)),
      };
    }, tenderId2 as string);
    expect(sbd61_90.status).toBe(200);
    expect(sbd61_90.header).toBe("%PDF-");
    expect(sbd61_90.len).toBeGreaterThan(1000);

    // Ownership isolation: User B cannot download User A's tender SBDs
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("/signup");
    await pageB.getByTestId("input-name").fill("SBD User B");
    await pageB.getByTestId("input-email").fill(emailB);
    await pageB.getByTestId("input-password").fill(password);
    await pageB.getByTestId("submit-signup").click();
    await pageB.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(pageB.getByTestId("user-email")).toContainText(emailB.toLowerCase(), {
      timeout: 10000,
    });
    await pageB.goto("/setup");
    await pageB.getByTestId("input-company-name").fill("SBD Co B Pty Ltd");
    await pageB.getByTestId("input-cipc-num").fill("2022/654321/07");
    await pageB.getByTestId("submit-company-btn").click();
    await expect(pageB.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });

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
    await page.getByTestId("input-name").fill("SBD A11y User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(email.toLowerCase(), {
      timeout: 10000,
    });
    await page.goto("/setup");
    await expect(page.getByTestId("company-form-card")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-company-name").fill("SBD A11y Co Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });

    await page.goto("/analyze");
    await expect(page.getByTestId("analyze-title")).toBeVisible({ timeout: 10000 });

    // Upload and analyze to expose SBD buttons for a11y check
    const pdfBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nstream\nTender with CIDB 4EB and SBD forms\nendstream\nendobj\n",
    );
    await page.getByTestId("file-input").setInputFiles({
      name: "tender.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
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
