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

/**
 * Clear all session state (cookies + web storage) and unload the app.
 *
 * The still-mounted SPA keeps better-auth's last session in memory; after
 * `clearCookies()` its guards react to the next poll and race whatever full
 * page load comes next (flaky "navigation interrupted" on webkit). Unloading
 * to about:blank first makes the subsequent navigation deterministic.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await page.goto("about:blank");
}
