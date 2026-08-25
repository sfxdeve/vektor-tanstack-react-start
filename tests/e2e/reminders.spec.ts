import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clearSession, ensureCompanySetup } from "./helpers";
import { promoteLocalUserToAdmin } from "./local-admin";
import { makePdf } from "./fixtures";

function uniqueEmail(prefix = "reminder") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  // Return YYYY-MM-DD for expiry input
  return d.toISOString().slice(0, 10);
}

async function signupAndCreateCompany(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("signup-form")).toBeVisible();
  await page.getByTestId("input-name").fill("Reminder Test User");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
  await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });

  await ensureCompanySetup(page);
  await page.getByTestId("input-company-name").fill("Reminder Test Pty Ltd");
  await page.getByTestId("input-cipc-num").fill("2021/123456/07");
  await page.getByTestId("input-contact-email").fill(email);
  await page.getByTestId("input-cidb-grade").fill("4GB, 6CE");
  await page.getByTestId("select-bbbee-level").click();
  await page.getByRole("option", { name: /Level 1/ }).click();
  await page.getByTestId("submit-company-btn").click();
  await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
  // setup auto-redirects to /app ~1.2s after save; wait it out so
  // follow-up navigations never race the router
  await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

  const response = await page.request.get("/api/companies");
  expect(response.ok()).toBe(true);
  const companies = (await response.json()) as Array<{ id: string }>;
  expect(companies).toHaveLength(1);
  return companies[0]!.id;
}

async function createLocalAdmin(browser: import("@playwright/test").Browser): Promise<{
  context: import("@playwright/test").BrowserContext;
  page: import("@playwright/test").Page;
}> {
  const email = uniqueEmail("reminder-admin");
  const password = "correct-horse-battery-staple-123";
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByTestId("input-name").fill("Reminder Admin");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
  promoteLocalUserToAdmin(email);
  await clearSession(page);
  await page.goto("/login");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-login").click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
  return { context, page };
}

test.describe.serial("Reminders and Cron (Resend + sent_reminders)", () => {
  test("7-day expiry triggers one email, second sweep does not duplicate, DEV_MAILBOX inspectable", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("rem");
    const password = "correct-horse-battery-staple-123";

    const companyId = await signupAndCreateCompany(page, email, password);
    const admin = await createLocalAdmin(browser);

    // Clear mailbox before test
    await page.request.delete("/api/dev/mailbox");
    const emptyMailbox = await page.request.get("/api/dev/mailbox");
    expect(emptyMailbox.ok()).toBe(true);
    expect((await emptyMailbox.json()) as Array<unknown>).toHaveLength(0);

    // Go to documents and upload a doc with expiry 7 days from now
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });

    const expiry7 = daysFromNow(7);

    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Tax Clearance Pin/ }).click();
    await page.getByTestId("input-expiry-date").fill(expiry7);

    await page
      .getByTestId("input-file-upload")
      .setInputFiles(await makePdf("tax-7days.pdf", [`Valid until ${expiry7}.`]));

    // Wait for preview hint but not required for upload
    await page.getByTestId("add-document-btn").click();

    const row = page.locator('[data-testid^="doc-row-"]');
    await expect(row.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("documents-list-card")).toContainText("tax-7days.pdf");

    const sweepResponses = await Promise.all([
      admin.page.request.post("/api/reminders/sweep"),
      admin.page.request.post("/api/reminders/sweep"),
    ]);
    expect(sweepResponses.every((response) => response.ok())).toBe(true);
    const sweepResults = await Promise.all(sweepResponses.map((response) => response.json()));
    const ourConcurrentDetails = sweepResults.flatMap(
      (result) => (result.details ?? []) as Array<Record<string, unknown>>,
    );
    const ourSent1 = ourConcurrentDetails.filter(
      (detail) =>
        detail.companyId === companyId && detail.threshold === 7 && detail.status === "sent",
    );
    expect(ourSent1).toHaveLength(1);

    // Check mailbox has at least one email with 7-day threshold for our company
    const mailbox1 = await page.request.get("/api/dev/mailbox");
    expect(mailbox1.ok()).toBeTruthy();
    const emails1 = (await mailbox1.json()) as Array<Record<string, unknown>>;
    const ourEmails1 = emails1.filter((e) => e.companyId === companyId && e.threshold === 7);
    expect(ourEmails1.length).toBe(1);
    const email1 = ourEmails1[0]!;
    expect((email1.subject as string) || (email1.html as string)).toBeDefined();
    const subjectText = (email1.subject as string | undefined) ?? "";
    const htmlText = (email1.html as string | undefined) ?? "";
    const subjectOrHtml = `${subjectText} ${htmlText}`;
    expect(subjectOrHtml).toContain("7");
    expect((email1.html as string) ?? "").toContain("#D97706");
    expect((email1.html as string) ?? "").toContain("URGENT");
    const toField = (email1.to as string) ?? "";
    expect(toField.toLowerCase()).toContain(email.toLowerCase());

    const sweep2 = await admin.page.request.post("/api/reminders/sweep");
    expect(sweep2.ok()).toBeTruthy();
    const sweep2Json = await sweep2.json();
    const details2 = (sweep2Json.details ?? []) as Array<Record<string, unknown>>;
    expect(
      details2.filter(
        (detail) =>
          detail.companyId === companyId && detail.threshold === 7 && detail.status === "sent",
      ),
    ).toHaveLength(0);

    const mailbox2 = await page.request.get("/api/dev/mailbox");
    const emails2 = (await mailbox2.json()) as Array<Record<string, unknown>>;
    const ourEmails2 = emails2.filter((e) => e.companyId === companyId && e.threshold === 7);
    expect(ourEmails2.length).toBe(1); // still 1, no duplicate

    // Deleting the document removes its reminder claim and the document from future sweeps.
    const documentsResponse = await page.request.get(`/api/documents/company/${companyId}`);
    expect(documentsResponse.ok()).toBe(true);
    const currentDocuments = (await documentsResponse.json()) as Array<{ id: string }>;
    expect(currentDocuments).toHaveLength(1);
    const deleteResponse = await page.request.delete(`/api/documents/${currentDocuments[0]!.id}`);
    expect(deleteResponse.ok()).toBe(true);

    await page.request.delete("/api/dev/mailbox");
    const sweepAfterDelete = await admin.page.request.post("/api/reminders/sweep");
    expect(sweepAfterDelete.ok()).toBe(true);
    const sweepAfterJson = await sweepAfterDelete.json();
    expect(sweepAfterJson.sent).toBe(0);
    const mailboxAfter = await page.request.get("/api/dev/mailbox");
    const emailsAfter = (await mailboxAfter.json()) as Array<unknown>;
    expect(emailsAfter).toHaveLength(0);

    // Non-compliant docs should not trigger — upload a non-compliant doc with 7-day expiry
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /COIDA/ }).click();
    await page.getByTestId("input-expiry-date").fill(daysFromNow(7));
    // Set to Non-Compliant via select
    await page.getByTestId("select-compliance-status").click();
    await page.getByRole("option", { name: /Non-Compliant/ }).click();
    await page
      .getByTestId("input-file-upload")
      .setInputFiles(await makePdf("coida-noncompliant.pdf", [`Valid until ${daysFromNow(7)}.`]));
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("coida-noncompliant.pdf")).toBeVisible({ timeout: 8000 });

    await page.request.delete("/api/dev/mailbox");
    const sweepNonCompliant = await admin.page.request.post("/api/reminders/sweep");
    const sweepNonJson = await sweepNonCompliant.json();
    // Should be 0 sent because non-compliant skipped
    expect(sweepNonJson.sent).toBe(0);
    const mailboxNon = await page.request.get("/api/dev/mailbox");
    const emailsNon = (await mailboxNon.json()) as Array<unknown>;
    expect(emailsNon.length).toBe(0);
    await admin.context.close();
  });

  test("threshold 0 uses #DC2626 and expired banner", async ({ page, browser }) => {
    const email = uniqueEmail("rem0");
    const password = "correct-horse-battery-staple-123";

    await signupAndCreateCompany(page, email, password);
    const admin = await createLocalAdmin(browser);

    await page.request.delete("/api/dev/mailbox");

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });

    const expiry0 = daysFromNow(0);

    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /B-BBEE/ }).click();
    await page.getByTestId("input-expiry-date").fill(expiry0);
    await page
      .getByTestId("input-file-upload")
      .setInputFiles(await makePdf("bbbee-expired.pdf", [`Valid until ${expiry0}.`]));
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("bbbee-expired.pdf")).toBeVisible({ timeout: 8000 });

    const sweep = await admin.page.request.post("/api/reminders/sweep");
    expect(sweep.ok()).toBeTruthy();
    const mailbox = await page.request.get("/api/dev/mailbox");
    const emails = (await mailbox.json()) as Array<Record<string, unknown>>;
    // Should have at least 1 email for expiry today
    const expiredEmail = emails.find((e) => {
      const html = (e.html as string) ?? "";
      return html.includes("#DC2626") || (e.subject as string)?.includes("EXPIRED");
    });
    expect(expiredEmail).toBeDefined();
    expect((expiredEmail!.html as string) ?? "").toContain("#DC2626");
    expect((expiredEmail!.html as string) ?? "").toContain("EXPIRED TODAY");
    await admin.context.close();
  });

  test("vault has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("rem-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("A11y Rem User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("A11y Rem Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
