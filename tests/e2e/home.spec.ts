import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page renders the scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Vektor");
  await expect(page.getByRole("heading", { name: "TanStack Start is ready." })).toBeVisible();
});

test("home page has no accessibility violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
