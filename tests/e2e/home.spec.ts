import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureCompanySetup } from "./helpers";

test("home page renders the scaffold", async ({ page }) => {
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

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
