import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureCompanySetup } from "./helpers";

function uniqueEmail(prefix = "vault") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

test.describe("Compliance Document Vault", () => {
  test("upload → expiry warning → bargaining tag → delete", async ({ page }) => {
    const email = uniqueEmail("vault");
    const password = "correct-horse-battery-staple-123";

    // Signup via UI
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await page.getByTestId("input-name").fill("Test Vault User");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    // After signup we should land on /app (dashboard)
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    // Ensure authenticated by checking sidebar user email
    await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });

    // Create company via setup
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("Vault Test Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(email);
    // Set CIDB and B-BBEE to cover later checks
    await page.getByTestId("input-cidb-grade").fill("4GB, 6CE");
    // B-BBEE level 1
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Go to documents vault
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("add-document-card")).toBeVisible();
    await expect(page.getByTestId("documents-list-card")).toBeVisible();

    // Initially empty
    await expect(page.getByTestId("empty-docs")).toBeVisible();

    // --- Upload TAX_PIN with mismatched expiry vs extracted ---
    // Select doc type TAX_PIN
    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Tax Clearance Pin/ }).click();
    await expect(page.getByTestId("link-sars-tcs-portal")).toBeVisible();

    // Typed expiry: 2026-12-31, but PDF will claim 2027-01-15 -> mismatch warning expected
    await page.getByTestId("input-expiry-date").fill("2026-12-31");

    // Create a fake PDF buffer containing expiry anchor text
    const pdfWithExpiry = Buffer.from(
      "Valid until 2027-01-15\nThis is a Tax Clearance certificate mock.\n",
    );
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "tax-pin.pdf",
      mimeType: "application/pdf",
      buffer: pdfWithExpiry,
    });

    // Preview hint should appear with detected expiry and offer Use this date
    await expect(page.getByTestId("bbbee-preview-hint")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId("bbbee-preview-expiry")).toContainText("1/15/2027");
    // Don't use autofill — keep mismatch to test warning on upload

    await page.getByTestId("add-document-btn").click();

    // Should show toast for mismatch? Wait for row to appear
    const taxRow = page.locator('[data-testid^="doc-row-"]');
    await expect(taxRow.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("documents-list-card")).toContainText("TAX PIN");
    await expect(page.getByTestId("documents-list-card")).toContainText("tax-pin.pdf");

    // Expiry mismatch badge should be visible for this doc
    const mismatchBadge = page.locator('[data-testid^="doc-expiry-mismatch-"]');
    await expect(mismatchBadge.first()).toBeVisible({ timeout: 5000 });
    await expect(mismatchBadge.first()).toContainText("Cert:");

    // Edit the doc to fix expiry via edit dialog
    const editBtn = page.locator('[data-testid^="edit-doc-"]').first();
    await editBtn.click();
    await expect(page.getByTestId("edit-doc-dialog")).toBeVisible();
    await page.getByTestId("edit-expiry-date").fill("2027-01-15");
    await page.getByTestId("edit-doc-save").click();
    await expect(page.getByTestId("edit-doc-dialog")).toBeHidden({ timeout: 5000 });
    // After fix, mismatch badge should disappear
    await expect(mismatchBadge).toHaveCount(0, { timeout: 5000 });

    // --- Upload BARGAINING_COUNCIL_GOS with council tag ---
    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Bargaining Council/ }).click();
    await expect(page.getByTestId("bc-picker-wrapper")).toBeVisible();
    await page.getByTestId("select-bargaining-council").click();
    await page.getByRole("option", { name: /BCCEI/ }).first().click();

    await page.getByTestId("input-expiry-date").fill("2027-12-31");
    const bcPdf = Buffer.from("Valid until 2027-12-31\nBCCEI Letter of Good Standing\n");
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "bccei.pdf",
      mimeType: "application/pdf",
      buffer: bcPdf,
    });
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("bccei.pdf")).toBeVisible({ timeout: 8000 });
    // Council tag should be visible
    const councilTag = page.locator('[data-testid^="doc-council-"]').first();
    await expect(councilTag).toContainText("BCCEI");

    // Upload another BC letter for different council should NOT delete the first (scoped purge)
    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Bargaining Council/ }).click();
    await page.getByTestId("select-bargaining-council").click();
    await page.getByRole("option", { name: /NBCEI/ }).first().click();
    await page.getByTestId("input-expiry-date").fill("2028-01-01");
    const nbceiPdf = Buffer.from("Valid until 2028-01-01\nNBCEI Letter\n");
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "nbcei.pdf",
      mimeType: "application/pdf",
      buffer: nbceiPdf,
    });
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("nbcei.pdf")).toBeVisible({ timeout: 8000 });
    // Both BCCEI and NBCEI should be present
    await expect(page.getByText("bccei.pdf")).toBeVisible();
    const allCouncilTags = page.locator('[data-testid^="doc-council-"]');
    await expect(allCouncilTags).toHaveCount(2);
    await expect(page.getByText("BCCEI").first()).toBeVisible();
    await expect(page.getByText("NBCEI").first()).toBeVisible();

    // Re-upload BCCEI should replace only BCCEI letter, NBCEI should remain
    await page.getByTestId("select-doc-type").click();
    await page.getByRole("option", { name: /Bargaining Council/ }).click();
    await page.getByTestId("select-bargaining-council").click();
    await page.getByRole("option", { name: /BCCEI/ }).first().click();
    await page.getByTestId("input-expiry-date").fill("2028-06-01");
    const bcceiV2 = Buffer.from("Valid until 2028-06-01\nBCCEI v2\n");
    await page.getByTestId("input-file-upload").setInputFiles({
      name: "bccei-v2.pdf",
      mimeType: "application/pdf",
      buffer: bcceiV2,
    });
    await page.getByTestId("add-document-btn").click();
    await expect(page.getByText("bccei-v2.pdf")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("bccei.pdf")).toBeHidden();
    await expect(allCouncilTags).toHaveCount(2);
    await expect(page.getByText("nbcei.pdf")).toBeVisible();

    // --- Delete flow ---
    // Delete the TAX PIN doc (first doc row before BC ones? find by file name)
    // Locate delete button for tax-pin.pdf row
    const taxDeleteBtn = page.locator('[data-testid^="delete-doc-"]').first();
    // Need to ensure we target correct doc: find row containing tax-pin.pdf then its delete
    // Simpler: count docs before delete
    const rowsBefore = await page.locator('[data-testid^="doc-row-"]').count();
    await taxDeleteBtn.click();
    await expect(page.getByTestId("delete-doc-dialog")).toBeVisible();
    await page.getByTestId("delete-doc-confirm").click();
    // Dialog should close and row count decrease
    await expect(page.getByTestId("delete-doc-dialog")).toBeHidden({ timeout: 5000 });
    const rowsAfter = await page.locator('[data-testid^="doc-row-"]').count();
    expect(rowsAfter).toBe(rowsBefore - 1);

    // Verify mobile nav still works
    await expect(page.getByTestId("sidebar")).toBeAttached();
  });

  test("document vault has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("vault-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("A11y User");
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
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("vault-title")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
