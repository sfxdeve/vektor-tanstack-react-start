import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
  await expect(page.getByTestId("signup-form")).toBeVisible();
  await page.getByTestId("input-name").fill("Reminder Test User");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
  await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });

  await page.goto("/setup");
  await expect(page.getByTestId("company-form-card")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("input-company-name").fill("Reminder Test Pty Ltd");
  await page.getByTestId("input-cipc-num").fill("2021/123456/07");
  await page.getByTestId("input-contact-email").fill(email);
  await page.getByTestId("input-cidb-grade").fill("4GB, 6CE");
  await page.getByTestId("select-bbbee-level").click();
  await page.getByRole("option", { name: /Level 1/ }).click();
  await page.getByTestId("submit-company-btn").click();
  await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });

  // Return companyId via API
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await page.request.get("/api/companies", {
    headers: { cookie: cookieHeader },
  });
  const json = await res.json().catch(() => []);
  const company = Array.isArray(json) ? json[0] : json;
  const companyId = company?.id || company?.companyId;
  if (!companyId) {
    // Try alternative: fetch via page evaluate
    const alt = await page.evaluate(async () => {
      const r = await fetch("/api/companies");
      const j = await r.json().catch(() => []);
      return j;
    });
    const c = Array.isArray(alt) ? alt[0] : alt;
    return c?.id || c?.companyId || null;
  }
  return companyId as string;
}

test.describe.serial("Reminders and Cron (Resend + sent_reminders)", () => {
  test("7-day expiry triggers one email, second sweep does not duplicate, DEV_MAILBOX inspectable", async ({
    page,
  }) => {
    const email = uniqueEmail("rem");
    const password = "correct-horse-battery-staple-123";

    await signupAndCreateCompany(page, email, password);

    // Ensure we have companyId
    const companyId = await page.evaluate(async () => {
      const r = await fetch("/api/companies");
      const j = await r.json().catch(() => []);
      const c = Array.isArray(j) ? j[0] : j;
      return c?.id ?? c?.companyId ?? null;
    });
    expect(companyId).toBeTruthy();

    // Clear mailbox before test
    await page.request.delete("/api/dev/mailbox");
    const emptyMailbox = await page.request.get("/api/dev/mailbox");
    const emptyJson = await emptyMailbox.json().catch(() => []);
    expect(Array.isArray(emptyJson) ? emptyJson.length : 0).toBe(0);

    // Go to documents and upload a doc with expiry 7 days from now
    await page.goto("/documents");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });

    const expiry7 = daysFromNow(7);

    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Tax Clearance Pin/ }).click();
    await page.getByTestId("input-expiry-date").fill(expiry7);

    const pdfWithExpiry = Buffer.from(
      `Valid until ${expiry7}\nThis is a Tax Clearance certificate mock.\n`,
    );
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "tax-7days.pdf",
      mimeType: "application/pdf",
      buffer: pdfWithExpiry,
    });

    // Wait for preview hint but not required for upload
    await page.getByTestId("add-document-btn").click();

    const row = page.locator('[data-testid^="doc-row-"]');
    await expect(row.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("documents-list-card")).toContainText("tax-7days.pdf");

    // Trigger sweep via API (dev mode allows without admin)
    const sweep1 = await page.request.post("/api/reminders/sweep");
    expect(sweep1.ok()).toBeTruthy();
    const sweep1Json = await sweep1.json();
    expect(sweep1Json.sent).toBeGreaterThanOrEqual(1);
    // At least one sent for our company
    const details1 = (sweep1Json.details ?? []) as Array<Record<string, unknown>>;
    const ourSent1 = details1.filter(
      (d) => d.companyId === companyId && d.threshold === 7 && d.status === "sent",
    );
    expect(ourSent1.length).toBe(1);

    // Check mailbox has at least one email with 7-day threshold for our company
    const mailbox1 = await page.request.get("/api/dev/mailbox");
    expect(mailbox1.ok()).toBeTruthy();
    const emails1 = (await mailbox1.json()) as Array<Record<string, unknown>>;
    const ourEmails1 = emails1.filter((e) => e.companyId === companyId && e.threshold === 7);
    expect(ourEmails1.length).toBe(1);
    const email1 = ourEmails1[0]!;
    expect((email1.subject as string) || (email1.html as string)).toBeDefined();
    const subjectOrHtml = `${String(email1.subject ?? "")} ${String(email1.html ?? "")}`;
    expect(subjectOrHtml).toContain("7");
    expect((email1.html as string) ?? "").toContain("#D97706");
    expect((email1.html as string) ?? "").toContain("URGENT");
    const toField = (email1.to as string) ?? "";
    expect(toField.toLowerCase()).toContain(email.toLowerCase());

    // Second sweep should not duplicate (idempotency)
    const sweep2 = await page.request.post("/api/reminders/sweep");
    expect(sweep2.ok()).toBeTruthy();
    const sweep2Json = await sweep2.json();
    const details2 = (sweep2Json.details ?? []) as Array<Record<string, unknown>>;
    const ourSent2 = details2.filter(
      (d) => d.companyId === companyId && d.threshold === 7 && d.status === "sent",
    );
    expect(ourSent2.length).toBe(0);
    const ourSkipped2 = details2.filter(
      (d) => d.companyId === companyId && d.threshold === 7 && d.status === "skipped",
    );
    expect(ourSkipped2.length).toBeGreaterThanOrEqual(1);

    const mailbox2 = await page.request.get("/api/dev/mailbox");
    const emails2 = (await mailbox2.json()) as Array<Record<string, unknown>>;
    const ourEmails2 = emails2.filter((e) => e.companyId === companyId && e.threshold === 7);
    expect(ourEmails2.length).toBe(1); // still 1, no duplicate

    // Verify deleting document clears sent_reminders and allows new sweep to not find doc
    // Delete the document via UI or API
    const docId = (await page.evaluate(async () => {
      const r = await fetch(
        `/api/documents/company/${((await (await fetch("/api/companies")).json()) as Array<Record<string, unknown>>)[0]?.id}`,
      );
      const j = (await r.json().catch(() => [])) as Array<Record<string, unknown>>;
      const docs = Array.isArray(j) ? j : [];
      return (docs[0]?.id as string | null) ?? null;
    })) as string | null;

    if (docId) {
      // Delete via API
      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      await page.request.delete(`/api/documents/${docId}`, {
        headers: { cookie: cookieHeader },
      });
      // Clear mailbox and sweep again — should be 0 sent (no docs)
      await page.request.delete("/api/dev/mailbox");
      const sweepAfterDelete = await page.request.post("/api/reminders/sweep");
      const sweepAfterJson = await sweepAfterDelete.json();
      expect(sweepAfterJson.sent).toBe(0);
      const mailboxAfter = await page.request.get("/api/dev/mailbox");
      const emailsAfter = (await mailboxAfter.json()) as Array<unknown>;
      expect(emailsAfter.length).toBe(0);
    }

    // Non-compliant docs should not trigger — upload a non-compliant doc with 7-day expiry
    await page.goto("/documents");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    // Need to get companyId again
    const companyId2 = await page.evaluate(async () => {
      const r = await fetch("/api/companies");
      const j = await r.json().catch(() => []);
      const c = Array.isArray(j) ? j[0] : j;
      return c?.id ?? c?.companyId ?? null;
    });
    expect(companyId2).toBeTruthy();

    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /COIDA/ }).click();
    await page.getByTestId("input-expiry-date").fill(daysFromNow(7));
    // Set to Non-Compliant via select
    await page.getByTestId("select-compliance-status").click();
    await page.getByRole("option", { name: /Non-Compliant/ }).click();
    const coidaPdf = Buffer.from(`Valid until ${daysFromNow(7)}\nCOIDA mock\n`);
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "coida-noncompliant.pdf",
      mimeType: "application/pdf",
      buffer: coidaPdf,
    });
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("coida-noncompliant.pdf")).toBeVisible({ timeout: 8000 });

    await page.request.delete("/api/dev/mailbox");
    const sweepNonCompliant = await page.request.post("/api/reminders/sweep");
    const sweepNonJson = await sweepNonCompliant.json();
    // Should be 0 sent because non-compliant skipped
    expect(sweepNonJson.sent).toBe(0);
    const mailboxNon = await page.request.get("/api/dev/mailbox");
    const emailsNon = (await mailboxNon.json()) as Array<unknown>;
    expect(emailsNon.length).toBe(0);
  });

  test("threshold 0 uses #DC2626 and expired banner", async ({ page }) => {
    const email = uniqueEmail("rem0");
    const password = "correct-horse-battery-staple-123";

    await signupAndCreateCompany(page, email, password);

    await page.request.delete("/api/dev/mailbox");

    await page.goto("/documents");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });

    const expiry0 = daysFromNow(0);

    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /B-BBEE/ }).click();
    await page.getByTestId("input-expiry-date").fill(expiry0);
    const pdf = Buffer.from(`Valid until ${expiry0}\nB-BBEE Level 1 mock\n`);
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "bbbee-expired.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("bbbee-expired.pdf")).toBeVisible({ timeout: 8000 });

    const sweep = await page.request.post("/api/reminders/sweep");
    expect(sweep.ok()).toBeTruthy();
    const mailbox = await page.request.get("/api/dev/mailbox");
    const emails = (await mailbox.json()) as Array<Record<string, unknown>>;
    // Should have at least 1 email for expiry today
    const expiredEmail = emails.find((e) => {
      const html = (e.html as string) ?? "";
      return html.includes("#DC2626") || (e.subject as string)?.includes("EXPIRED");
    });
    expect(expiredEmail).toBeTruthy();
    if (expiredEmail) {
      expect((expiredEmail.html as string) ?? "").toContain("#DC2626");
      expect((expiredEmail.html as string) ?? "").toContain("EXPIRED TODAY");
    }
  });

  test("vault has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("rem-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.getByTestId("input-name").fill("A11y Rem User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await page.goto("/setup");
    await expect(page.getByTestId("company-form-card")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-company-name").fill("A11y Rem Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2020/123456/07");
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    await page.goto("/documents");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
