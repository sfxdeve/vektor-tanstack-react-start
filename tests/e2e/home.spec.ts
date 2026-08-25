import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clearSession, ensureCompanySetup } from "./helpers";

test("landing page renders the marketing home", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveTitle("Vektor");
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Never lose a bid/ })).toBeVisible();
});

test("home page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("auth pages have no accessibility violations", async ({ page }) => {
  for (const path of [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password?token=e2e-a11y-probe",
  ]) {
    await page.goto(path);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 15000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `a11y violations on ${path}`).toEqual([]);
  }
});

test("forgot password mail resets credentials and new password signs in", async ({ page }) => {
  const email = `reset.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const oldPassword = "correct-horse-battery-staple-123";
  const newPassword = "new-correct-horse-battery-456";
  await page.goto("/signup");
  await page.getByTestId("input-name").fill("Reset Journey");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(oldPassword);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });

  await page.request.delete("/api/dev/mailbox");
  await clearSession(page);
  await page.goto("/forgot-password");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("submit-forgot").click();
  await expect(page.getByTestId("forgot-sent-state")).toBeVisible();

  let resetUrl = "";
  await expect
    .poll(async () => {
      const messages = (await (await page.request.get("/api/dev/mailbox")).json()) as Array<{
        type?: string;
        raw?: { url?: string };
      }>;
      resetUrl = messages.find((message) => message.type === "reset-password")?.raw?.url ?? "";
      return resetUrl;
    })
    .toMatch(/\/api\/auth\/reset-password\//);

  await page.goto(resetUrl);
  await page.getByTestId("input-password").fill(newPassword);
  await page.getByTestId("input-confirm-password").fill(newPassword);
  await page.getByTestId("submit-reset").click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(newPassword);
  await page.getByTestId("submit-login").click();
  await expect(page).toHaveURL(/\/app|\/setup/, { timeout: 15000 });
  await expect(page.getByTestId("user-email")).toContainText(email);
});

test("login returns a user to the protected deep link", async ({ page }) => {
  const email = `deep-link.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "correct-horse-battery-staple-123";
  await page.goto("/signup");
  await page.getByTestId("input-name").fill("Deep Link User");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });

  await clearSession(page);
  await page.goto("/documents");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdocuments/, { timeout: 15000 });
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-login").click();

  await expect(page).toHaveURL(/\/documents$/, { timeout: 15000 });
  await expect(page.getByTestId("nav-documents")).toHaveAttribute("aria-current", "page");
});

test("setup page has no accessibility violations", async ({ page }) => {
  // Fresh signup lands on /setup with no company yet — the guarded route state
  const email = `a11y.setup.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("signup-form")).toBeVisible();
  await page.getByTestId("input-name").fill("A11y Setup");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill("correct-horse-battery-staple-123");
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
  await ensureCompanySetup(page);
  await page.getByTestId("bc-multiselect-trigger").click();
  await expect(page.getByTestId("bc-multiselect-option-BCCEI")).toBeVisible();
  await page.getByTestId("bc-multiselect-option-BCCEI").click();
  await expect(page.getByTestId("bc-chip-BCCEI")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bc-multiselect-content")).toHaveCount(0);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
