import { expect, type Page } from "@playwright/test";

/**
 * Ensure the company setup form is on screen for the current session.
 *
 * Right after signup the TanStack router may still be navigating client-side
 * (typically to `/app`), so an immediate `page.goto("/setup")` can be
 * interrupted mid-flight (flaky on webkit). This helper waits until routing
 * has settled on either destination — dashboard or the setup form — and only
 * then navigates explicitly when needed.
 */
export async function ensureCompanySetup(page: Page): Promise<void> {
  await expect(
    page.getByTestId("dashboard-title").or(page.getByTestId("company-form-card")),
  ).toBeVisible({ timeout: 20000 });
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByTestId("company-form-card")).toBeVisible({ timeout: 15000 });
}
