import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clearSession, ensureCompanySetup } from "./helpers";

// cert-bbbee-level2.pdf as base64 — page.evaluate() runs in the browser and
// cannot touch node:fs, so the fixture bytes travel inline.
const FIXTURE_B64 =
  "JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAyOTEKPj4Kc3RyZWFtCnicjZFNSgQxEIX3OUXWglip3wRE0O4ZXLgRcgGRURRdjIjn96UbFMGGIRRJV72kvld9TDc9UR7r4zld3B7evg6fL48P50GtaqWoLRfO/Smx5n6XyiIt2SiHU+7v6VKZZ2UsU2MyMdWCo5kw6YSDozKhgt1YmzpChgb7XndQyags3781u8r9NfWztOvpPh23OFsoe2XzuskpvnKa70IdF6LJNbpaVC8+B/nkNih8D4WgzmEuQzsyTFyNxi1uwxHyehobE1Ela9U32Ub+nxmiR0FHi2WGbuFuPg1q4R9ScIIQrFDvg0+dlxGMMcUWk9e6MJ32Hrqzifi2R3ddPQp88DJVR8hwOOaObMU/aKgBy3XNr15lhPMsBb5nESl/qL4B56CYAQplbmRzdHJlYW0KZW5kb2JqCgo3IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9PYmpTdG0KL04gNQovRmlyc3QgMjYKL0xlbmd0aCA0MDcKPj4Kc3RyZWFtCnic1VNLa9wwEL77V8yxPSQay3qGZWGzu26hhIYkkNDSg2OLxSFIxdaW9N93xt5kCUnpuYhBmvm+kealEhAkKAUVWAcKdCVBg5MeFotC3Pz+GUBcNrswFuJL343wnTgIV/CjEOu0jxnKYrksjtx1k5vHtCtmJyiZ/My4HFK3b8MAi3pb14gWEY0iMYhyQ/uaxJNI0gmTjs4kVh2EbLZCrFaE1bMYO/swPnH1wX9LO3ENczYzV7lZf3mX39rOd8h/xeOXhbhI3abJAT5sziRKg06WpUNb6m8fqRxDaHL6f5Ob4u9T/GuGr/rM7eUmD4FnYOqyuApj2g8ttZ15dSKED5/D46+Q+7Y5segdxWmdpxmbXI6Yt0oaJ7VxbzGul0PtnXnPT6MyXqJ9i1ltpa4q8+JHKYi7r/cPoZ1CY3X7lD9dZ855NrDtInR9c56eaNqRlvb6VDpwqjylyGnyVzGmzH9h+gUxUw1YM4ef8apQXIZCXO/v86SysSzEeTOGqUDHaCmU2KaujzsQt31cxbF/NvCNfwCnbePICmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQwCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJwVxDEOADAIA7ELIHXtd5H6d0o8GJgJDji5cOlKXJDelg0fXvoDQgplbmRzdHJlYW0KZW5kb2JqCgpzdGFydHhyZWYKODg5CiUlRU9G";

function uniqueEmail(prefix = "admin") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`.toLowerCase();
}

async function signupViaUI(
  page: import("@playwright/test").Page,
  name: string,
  email: string,
  password: string,
  cipc = "2021/123456/07",
) {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("signup-form")).toBeVisible();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-signup").click();
  await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
  await expect(page.getByTestId("user-email")).toContainText(email, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  // create company - only navigate if not already on setup
  await ensureCompanySetup(page);
  await page.getByTestId("input-company-name").fill(`${name} Pty Ltd`);
  await page.getByTestId("input-cipc-num").fill(cipc);
  await page.getByTestId("input-contact-email").fill(email);
  await page.getByTestId("input-cidb-grade").fill("4GB");
  await page.getByTestId("select-bbbee-level").click();
  await page.getByRole("option", { name: /Level 1/ }).click();
  await page.getByTestId("submit-company-btn").click();
  await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
  // setup auto-redirects to /app ~1.2s after save; wait it out so
  // follow-up navigations never race the router
  await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
}

async function promoteToAdmin(page: import("@playwright/test").Page, email: string) {
  // API request context resolves against baseURL regardless of the page URL.
  const res = await page.request.post("/api/dev/set-role", {
    data: { email, role: "admin" },
  });
  expect(res.ok()).toBe(true);
}

async function loginViaUI(page: import("@playwright/test").Page, email: string, password: string) {
  await clearSession(page);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("submit-login").click();
  await expect(page).toHaveURL(/\/admin|\/app|\/setup/, { timeout: 20000 });
  // Wait until the destination has rendered its chrome and the network has
  // settled, so follow-up full-page loads never race the SPA (webkit).
  await expect(page.getByTestId("admin-nav").or(page.getByTestId("dashboard-title"))).toBeVisible({
    timeout: 20000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Admin Console (Issue 09)", () => {
  test("admin guard: unauthenticated and non-admin cannot access admin routes", async ({
    page,
  }) => {
    // Ensure clean session
    await clearSession(page);

    // Try to access /admin directly unauthenticated -> should redirect to /login
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 10000 });

    for (const path of ["/admin/users", "/admin/companies", "/admin/eft"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    }

    // Create non-admin user
    const email = uniqueEmail("guard-user");
    const password = "correct-horse-battery-staple-123";
    await signupViaUI(page, "Guard User", email, password);

    // Non-admin trying to access admin should redirect to /app
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 10000 });

    for (const path of ["/admin/users", "/admin/companies", "/admin/eft"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
    }

    // Admin nav should not be visible for non-admin (we are already on /app
    // via the guard redirect — an extra goto here races the SPA router)
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-nav")).toBeHidden();
  });

  test("admin routes have dark navy console, navigation, and overview stats", async ({ page }) => {
    const email = uniqueEmail("admin-overview");
    const password = "correct-horse-battery-staple-123";
    await signupViaUI(page, "Admin Overview", email, password);
    await promoteToAdmin(page, email);
    // need to re-login to pick up admin role
    await clearSession(page);
    await loginViaUI(page, email, password);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await expect(page.getByTestId("admin-nav")).toBeVisible();
    await expect(page.getByTestId("admin-nav")).toHaveClass(/bg-zinc-950/);
    await expect(page.getByTestId("admin-nav-overview")).toBeVisible();
    await expect(page.getByTestId("admin-nav-users")).toBeVisible();
    await expect(page.getByTestId("admin-nav-companies")).toBeVisible();
    await expect(page.getByTestId("admin-nav-eft")).toBeVisible();
    await expect(page.getByTestId("admin-overview-title")).toBeVisible();
    await expect(page.getByTestId("admin-overview-title")).toContainText("Admin Console");
    // Stats tiles
    await expect(page.getByTestId("admin-stat-users")).toBeVisible();
    await expect(page.getByTestId("admin-stat-companies")).toBeVisible();
    await expect(page.getByTestId("admin-stat-eft")).toBeVisible();
    // The class should be dark
    const statClass = await page.getByTestId("admin-stat-users").getAttribute("class");
    expect(statClass).toContain("bg-zinc-950");
    expect(statClass).toContain("border-zinc-800");
    // Stats should be numeric after loading (not just —) since we have at least 1 user/company
    await expect(page.getByTestId("admin-stat-users")).toContainText(/\d/, { timeout: 10000 });
    await expect(page.getByTestId("admin-stat-companies")).toContainText(/\d/, { timeout: 10000 });

    // Quick links
    await expect(page.getByTestId("admin-quick-users")).toBeVisible();
    await expect(page.getByTestId("admin-quick-companies")).toBeVisible();
    await expect(page.getByTestId("admin-quick-eft")).toBeVisible();

    // Navigate to subpages and check nav persists dark console
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-nav")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-users-title")).toBeVisible();
    await expect(page.getByTestId("admin-users-search")).toBeVisible();

    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-nav")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-companies-title")).toBeVisible();
    await expect(page.getByTestId("admin-companies-search")).toBeVisible();

    await page.goto("/admin/eft");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-nav")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-eft-title")).toBeVisible();
    await expect(page.getByTestId("admin-eft-filters")).toBeVisible();
    await expect(page.getByTestId("admin-eft-table")).toBeVisible();
  });

  test("users and companies list, search, detail and delete with cascading note", async ({
    page,
  }) => {
    const adminEmail = uniqueEmail("admin-list");
    // Unique per run — the local D1 database persists across e2e runs
    const disposableCompany = `Disposable ${uniqueEmail("co").split("@")[0]!.slice(8)} Pty Ltd`;
    const password = "correct-horse-battery-staple-123";
    await signupViaUI(page, "Admin List", adminEmail, password);
    await promoteToAdmin(page, adminEmail);

    // Create a disposable user to delete later
    const disposableEmail = uniqueEmail("disposable");
    await clearSession(page);
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("Disposable User");
    await page.getByTestId("input-email").fill(disposableEmail);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill(disposableCompany);
    await page.getByTestId("input-cipc-num").fill("2020/999999/07");
    await page.getByTestId("input-contact-email").fill(disposableEmail);
    await page.getByTestId("input-cidb-grade").fill("5CE");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 3/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Add a compliance doc and tender for that disposable user's company to test compliance history
    // Do via API for speed
    const setupInfo = await page.evaluate(async (fixtureB64: string) => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const cid = comps[0]!.id;
      // upload a compliance doc (fixture bytes serialized in from Node land)
      const fd = new FormData();
      const bytes = Uint8Array.from(atob(fixtureB64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      fd.append("file", blob, "bbbee.pdf");
      fd.append("doc_type", "BBBEE");
      fd.append("expiry_date", "2027-12-31");
      fd.append("company_id", cid);
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: fd });
      return { companyId: cid, uploadStatus: uploadRes.status };
    }, FIXTURE_B64);
    expect([200, 201].includes(setupInfo.uploadStatus)).toBe(true);

    // Now login as admin
    await clearSession(page);
    await loginViaUI(page, adminEmail, password);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    // Go to users list
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-nav-users")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-users-search")).toBeVisible({ timeout: 10000 });
    // List has loaded once the count renders a number
    await expect(page.getByTestId("admin-users-count")).toContainText(/\d/, { timeout: 15000 });
    // Should list at least admin and disposable
    await expect(page.getByText(adminEmail).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(disposableEmail).first()).toBeVisible({ timeout: 15000 });

    // Search filtering is client-side and synchronous; the unique prefix matches only the disposable user
    await page.getByTestId("admin-users-search").fill(disposableEmail.split("@")[0]!);
    await expect(page.getByTestId("admin-users-count")).toHaveText(/^1 users$/, {
      timeout: 10000,
    });
    await expect(page.getByText(disposableEmail).first()).toBeVisible();
    await page.getByTestId("admin-users-search").fill("");
    await expect(page.getByTestId("admin-users-count")).not.toHaveText(/^1 users$/, {
      timeout: 10000,
    });
    await expect(page.getByText(disposableEmail).first()).toBeVisible();

    // Find disposable user row id via API to get id for detail/delete selectors
    const disposableUserId = await page.evaluate(async (em: string) => {
      const r = await fetch("/api/admin/users");
      const users = (await r.json()) as Array<{ id: string; email: string }>;
      const u = users.find((x) => x.email.toLowerCase() === em.toLowerCase());
      return u?.id ?? null;
    }, disposableEmail);
    expect(disposableUserId).toBeTruthy();

    // Detail: click open
    await page.getByTestId(`admin-user-open-${disposableUserId}`).click();
    await expect(page.getByTestId(`admin-user-detail-${disposableUserId}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("admin-user-detail-companies")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-compliance")).toContainText(/docs/);
    await expect(page.getByTestId("admin-user-detail-tenders")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-credits")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-eft")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-reminders")).toBeVisible();
    // Check compliance state is reflected (we uploaded a BBBEE doc)
    await expect(page.getByTestId("admin-user-detail-compliance")).toContainText("BBBEE");

    await page.getByTestId("admin-user-detail-close").click();
    await expect(page.getByTestId(`admin-user-detail-${disposableUserId}`)).toBeHidden();

    // Companies list similar
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-companies-search")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(disposableCompany).first()).toBeVisible({ timeout: 15000 });

    await page.getByTestId("admin-companies-search").fill(disposableCompany.split(" ")[1]!);
    await expect(page.getByText(disposableCompany).first()).toBeVisible();
    await page.getByTestId("admin-companies-search").fill("");
    await expect(page.getByText(disposableCompany).first()).toBeVisible();

    const disposableCompanyId = await page.evaluate(async (cname: string) => {
      const r = await fetch("/api/admin/companies");
      const companies = (await r.json()) as Array<{ id: string; company_name: string }>;
      const c = companies.find((x) => x.company_name === cname);
      return c?.id ?? null;
    }, disposableCompany);
    expect(disposableCompanyId).toBeTruthy();

    // Company detail should show compliance state and tender/credit/reminder history
    await page.getByTestId(`admin-company-open-${disposableCompanyId}`).click();
    await expect(page.getByTestId(`admin-company-detail-${disposableCompanyId}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("admin-company-detail-docs")).toContainText("BBBEE");
    await expect(page.getByTestId("admin-company-detail-tenders")).toBeVisible();
    await expect(page.getByTestId("admin-company-detail-credits")).toBeVisible();
    await page.getByTestId("admin-company-detail-close").click();
    await expect(page.getByTestId(`admin-company-detail-${disposableCompanyId}`)).toBeHidden();

    // Delete company with confirmation and cascading note
    const compDeleteBtn = page.getByTestId(`admin-delete-${disposableCompanyId}`);
    await expect(compDeleteBtn).toBeVisible();
    await compDeleteBtn.click();
    await expect(page.getByTestId("admin-delete-dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Cascading deletes").first()).toBeVisible();
    await expect(page.locator("text=Compliance documents").first()).toBeVisible();
    await page.getByTestId("admin-delete-cancel").click();
    await expect(page.getByTestId("admin-delete-dialog")).toBeHidden();

    // Now actually delete
    await page.getByTestId(`admin-delete-${disposableCompanyId}`).click();
    await expect(page.getByTestId("admin-delete-dialog")).toBeVisible();
    await page.getByTestId("admin-delete-confirm").click();
    await expect(page.getByTestId("admin-delete-dialog")).toBeHidden({ timeout: 5000 });
    await expect(page.getByTestId(`admin-row-${disposableCompanyId}`)).toBeHidden({
      timeout: 10000,
    });

    // Verify via API company gone
    const afterCompDelete = await page.evaluate(async (cid: string) => {
      const r = await fetch(`/api/admin/companies/${cid}`);
      return r.status;
    }, disposableCompanyId as string);
    expect(afterCompDelete).toBe(404);

    // Delete user with confirmation noting cascading deletes across all domains
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId(`admin-user-row-${disposableUserId}`)).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId(`admin-user-delete-${disposableUserId}`).click();
    await expect(page.getByTestId("delete-user-dialog")).toBeVisible({ timeout: 5000 });
    // Check cascading note
    await expect(page.locator("text=Cascading deletes across").first()).toBeVisible();
    await expect(page.locator("text=Compliance documents").first()).toBeVisible();
    await expect(page.locator("text=EFT payments").first()).toBeVisible();
    await expect(page.getByText("Referrals and referral rewards").first()).toBeVisible();
    await page.getByTestId("delete-cancel").click();
    await expect(page.getByTestId("delete-user-dialog")).toBeHidden();

    await page.getByTestId(`admin-user-delete-${disposableUserId}`).click();
    await expect(page.getByTestId("delete-user-dialog")).toBeVisible();
    // require reason and confirm email
    await page.getByTestId("delete-reason").fill("Test cleanup: disposable account");
    await page.getByTestId("delete-confirm-email").fill("wrong@example.com");
    await page.getByTestId("delete-submit").click();
    // should show error toast about email mismatch, dialog stays
    await expect(page.getByTestId("delete-user-dialog")).toBeVisible();
    // fix email
    await page.getByTestId("delete-confirm-email").fill(disposableEmail);
    await page.getByTestId("delete-submit").click();
    await expect(page.getByTestId("delete-user-dialog")).toBeHidden({ timeout: 8000 });
    await expect(page.getByTestId(`admin-user-row-${disposableUserId}`)).toBeHidden({
      timeout: 10000,
    });

    const afterUserDelete = await page.evaluate(async (uid: string) => {
      const r = await fetch(`/api/admin/users/${uid}`);
      return r.status;
    }, disposableUserId as string);
    expect(afterUserDelete).toBe(404);

    // Verify audit: users list no longer contains deleted
    const usersAfter = await page.evaluate(async () => {
      const r = await fetch("/api/admin/users");
      const users = (await r.json()) as Array<{ email: string }>;
      return users.map((u) => u.email.toLowerCase());
    });
    expect(usersAfter).not.toContain(disposableEmail.toLowerCase());
  });

  test("EFT admin list, proof view, confirm grants credits, reject with reason and re-upload", async ({
    page,
  }) => {
    test.setTimeout(60000);
    const adminEmail = uniqueEmail("admin-eft");
    const userEmail = uniqueEmail("user-eft");
    const password = "correct-horse-battery-staple-123";

    // Create admin
    await signupViaUI(page, "Admin EFT", adminEmail, password);
    await promoteToAdmin(page, adminEmail);

    // Create regular user
    await clearSession(page);
    await signupViaUI(page, "User EFT", userEmail, password);

    // As user, request EFT for Starter and upload proof -> pending_review
    const starterPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const cid = comps[0]!.id;
      const reqRes = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_starter_monthly_v2", company_id: cid }),
      });
      const body = (await reqRes.json()) as { id: string; reference: string; status: string };
      return body;
    });
    expect(starterPayment.reference).toMatch(/VEK-[A-Z0-9]{6}/);
    expect(starterPayment.status).toBe("awaiting_proof");

    await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const blob = new Blob([buf], { type: "image/png" });
      const file = new File([blob], "proof.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
    }, starterPayment.id);

    const afterUpload = await page.evaluate(async (pid: string) => {
      const r = await fetch("/api/eft/my-requests");
      const data = (await r.json()) as { payments: Array<{ id: string; status: string }> };
      return data.payments.find((p) => p.id === pid)?.status;
    }, starterPayment.id);
    expect(afterUpload).toBe("pending_review");

    // Capture company id and initial credits for later credit grant check
    const companyId = await page.evaluate(async () => {
      const r = await fetch("/api/companies");
      const comps = (await r.json()) as Array<{ id: string }>;
      return comps[0]!.id;
    });
    const creditsBefore = await page.evaluate(async (cid: string) => {
      const r = await fetch(`/api/billing/credits/${cid}`);
      const data = (await r.json()) as { credits: number };
      return data.credits;
    }, companyId);

    // Login as admin
    await clearSession(page);
    await loginViaUI(page, adminEmail, password);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.goto("/admin/eft");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-eft-filters")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("admin-eft-table")).toBeVisible();
    // Should see pending payment row
    await expect(page.getByTestId(`admin-eft-row-${starterPayment.id}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`admin-eft-view-proof-${starterPayment.id}`)).toBeVisible();

    // View proof
    await page.getByTestId(`admin-eft-view-proof-${starterPayment.id}`).click();
    await expect(page.getByTestId("admin-eft-proof-dialog")).toBeVisible({ timeout: 8000 });
    // Should show image for PNG
    await expect(page.getByTestId("admin-eft-proof-image")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId("admin-eft-proof-download")).toBeVisible();
    // Close via close button
    await page.getByTestId("admin-eft-proof-close").click();
    await expect(page.getByTestId("admin-eft-proof-dialog")).toBeHidden();

    // Confirm payment (idempotently granting credits) via API (avoids flaky window.confirm dialog handling)
    const confirmRes = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
    }, starterPayment.id);
    expect(confirmRes.ok).toBe(true);
    await page.reload();
    await expect(page.getByTestId("admin-eft-filters")).toBeVisible({ timeout: 10000 });
    {
      const waitResp = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/eft/admin/all") &&
          resp.url().includes("status=confirmed") &&
          resp.request().method() === "GET",
        { timeout: 15000 },
      );
      await page.getByTestId("admin-eft-filter-confirmed").click();
      await waitResp;
    }
    const starterVisibleViaApi = await page.evaluate(async (pid: string) => {
      const r = await fetch("/api/eft/admin/all?status=confirmed");
      const data = (await r.json()) as { payments: Array<{ id: string }> };
      return data.payments.some((p) => p.id === pid);
    }, starterPayment.id);
    expect(starterVisibleViaApi).toBe(true);
    await expect(page.getByTestId(`admin-eft-row-${starterPayment.id}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(`[data-testid="admin-eft-row-${starterPayment.id}"]`)).toContainText(
      "Confirmed",
    );

    // Idempotent second confirm should return 200
    const secondConfirm = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      return r.status;
    }, starterPayment.id);
    expect(secondConfirm).toBe(200);

    // Check credits granted
    // Need to login as user again to check credits or stay as admin can still query?
    // As admin we can query billing credits endpoint for that user's company? But company belongs to user, not admin. Admin can still query via direct DB? We'll just check via API as user
    await clearSession(page);
    await loginViaUI(page, userEmail, password);
    // after login, user should be at /app, but we can check credits
    const creditsAfter = await page.evaluate(async (cid: string) => {
      const r = await fetch(`/api/billing/credits/${cid}`);
      const data = (await r.json()) as { credits: number };
      return data.credits;
    }, companyId);
    expect(creditsAfter).toBeGreaterThan(creditsBefore);

    // Check that admin confirmed is auditable via D1 state: fetch payment as admin again
    await clearSession(page);
    await loginViaUI(page, adminEmail, password);
    const paymentDetail = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/all`);
      const data = (await r.json()) as {
        payments: Array<{
          id: string;
          status: string;
          credits_granted: number | null;
          confirmed_at: string | null;
        }>;
      };
      return data.payments.find((p) => p.id === pid);
    }, starterPayment.id);
    expect(paymentDetail?.status).toBe("confirmed");
    expect(paymentDetail?.credits_granted).toBeGreaterThan(0);
    expect(paymentDetail?.confirmed_at).toBeTruthy();

    // Now test reject path: create another payment as user, upload proof, admin reject, user re-upload, admin confirm
    await clearSession(page);
    await loginViaUI(page, userEmail, password);
    const paygPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const cid = comps[0]!.id;
      const reqRes = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_credits_1_v2", company_id: cid }),
      });
      return (await reqRes.json()) as { id: string; reference: string };
    });
    await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const blob = new Blob([buf], { type: "application/pdf" });
      const file = new File([blob], "proof2.pdf", { type: "application/pdf" });
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
    }, paygPayment.id);

    // Login as admin to reject
    await clearSession(page);
    await loginViaUI(page, adminEmail, password);
    // The EFT console defaults to the pending_review filter; bind to its initial load
    const pendingLoad = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/eft/admin/all") &&
        resp.url().includes("status=pending_review") &&
        resp.request().method() === "GET",
      { timeout: 15000 },
    );
    await page.goto("/admin/eft");
    await pendingLoad;
    await expect(page.getByTestId("admin-eft-filters")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`admin-eft-row-${paygPayment.id}`)).toBeVisible({
      timeout: 10000,
    });

    // Try reject without reason via API should 400
    const rejectNoReason = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      });
      return r.status;
    }, paygPayment.id);
    expect(rejectNoReason).toBe(400);

    // Proper reject via UI button
    await page.getByTestId(`admin-eft-reject-${paygPayment.id}`).click();
    await expect(page.getByTestId("admin-eft-reject-dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("admin-eft-reject-reason")).toBeVisible();
    // Try submit empty
    await page.getByTestId("admin-eft-reject-submit").click();
    await expect(page.getByTestId("admin-eft-reject-dialog")).toBeVisible();
    await page.getByTestId("admin-eft-reject-reason").fill("Proof amount mismatch - test");
    await page.getByTestId("admin-eft-reject-submit").click();
    await expect(page.getByTestId("admin-eft-reject-dialog")).toBeHidden({ timeout: 5000 });
    {
      const waitResp = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/eft/admin/all") &&
          resp.url().includes("status=rejected") &&
          resp.request().method() === "GET",
        { timeout: 15000 },
      );
      await page.getByTestId("admin-eft-filter-rejected").click();
      await waitResp;
    }
    await expect(page.getByTestId(`admin-eft-row-${paygPayment.id}`)).toBeVisible();
    await expect(page.locator(`[data-testid="admin-eft-row-${paygPayment.id}"]`)).toContainText(
      "Rejected",
    );

    // Verify audit: status rejected and reason stored
    const rejectedPayment = await page.evaluate(async (pid: string) => {
      const r = await fetch("/api/eft/admin/all?status=rejected");
      const data = (await r.json()) as {
        payments: Array<{ id: string; reject_reason: string | null; status: string }>;
      };
      return data.payments.find((p) => p.id === pid);
    }, paygPayment.id);
    expect(rejectedPayment?.status).toBe("rejected");
    expect(rejectedPayment?.reject_reason).toContain("mismatch");

    // User re-upload after rejection should return to pending_review
    await clearSession(page);
    await loginViaUI(page, userEmail, password);
    const reuploadRes = await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const blob = new Blob([buf], { type: "image/png" });
      const file = new File([blob], "reupload.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
      return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
    }, paygPayment.id);
    expect(reuploadRes.ok).toBe(true);
    expect((reuploadRes.body as { status: string }).status).toBe("pending_review");

    // Admin can now confirm the re-uploaded payment
    await clearSession(page);
    await loginViaUI(page, adminEmail, password);
    const finalConfirm = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      return { ok: r.ok, status: r.status };
    }, paygPayment.id);
    expect(finalConfirm.ok).toBe(true);

    await page.goto("/admin/eft");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("admin-eft-filters")).toBeVisible({ timeout: 15000 });
    {
      const waitResp = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/eft/admin/all") &&
          resp.url().includes("status=confirmed") &&
          resp.request().method() === "GET",
        { timeout: 15000 },
      );
      await page.getByTestId("admin-eft-filter-confirmed").click();
      await waitResp;
    }
    // Check via API as primary assertion, UI must agree
    const confirmedViaApi = await page.evaluate(async (pid: string) => {
      const r = await fetch("/api/eft/admin/all?status=confirmed");
      const data = (await r.json()) as { payments: Array<{ id: string }> };
      return data.payments.some((p) => p.id === pid);
    }, paygPayment.id);
    expect(confirmedViaApi).toBe(true);
    await expect(page.getByTestId(`admin-eft-row-${paygPayment.id}`)).toBeVisible({
      timeout: 10000,
    });

    // Check referral reward side-effect not triggered for PAYG (should be 0 credits reward for PAYG)
    // Create referral scenario: referrer admin invites new user via referral link, new user does subscription, admin confirms, check reward 3/5/10
    // This part is covered in referral.spec.ts, but we can do quick check for starter reward via fresh referral
    const referrerEmail = adminEmail;
    const referrerCode = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      if (!r.ok) return null;
      const data = (await r.json()) as { code: string };
      return data.code as string;
    });
    expect(referrerCode).toMatch(/VEK-/);

    // Create new referee via referral link
    const refereeEmail = uniqueEmail("referee-reward");
    await clearSession(page);
    await page.goto(`/signup?ref=${referrerCode}`);
    await expect(page.getByTestId("signup-referral-banner")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-name").fill("Reward Referee");
    await page.getByTestId("input-email").fill(refereeEmail);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("Reward Referee Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2022/111111/07");
    await page.getByTestId("input-contact-email").fill(refereeEmail);
    await page.getByTestId("input-cidb-grade").fill("6CE");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    const rewardPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const cid = comps[0]!.id;
      const r = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_pro_monthly_v2", company_id: cid }),
      });
      return (await r.json()) as { id: string };
    });
    await page.evaluate(async (pid: string) => {
      const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const blob = new Blob([buf], { type: "image/png" });
      const file = new File([blob], "p.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/eft/upload-proof/${pid}`, { method: "POST", body: fd });
    }, rewardPayment.id);

    // Admin confirm should trigger referral reward 5 credits for Pro
    await clearSession(page);
    await loginViaUI(page, referrerEmail, password);
    const beforeRewardStats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      const data = (await r.json()) as { credits_earned: number; invited_count: number };
      return data;
    });
    const beforeCredits = beforeRewardStats.credits_earned;

    const rewardConfirm = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      return { ok: r.ok, status: r.status };
    }, rewardPayment.id);
    expect(rewardConfirm.ok).toBe(true);

    const afterRewardStats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      const data = (await r.json()) as { credits_earned: number; subscribed_count: number };
      return data;
    });
    expect(afterRewardStats.credits_earned).toBe(beforeCredits + 5);
    expect(afterRewardStats.subscribed_count).toBeGreaterThanOrEqual(1);

    // Auditable via referral_rewards D1 state - check activity feed contains referral_reward
    const activity = await page.evaluate(async () => {
      const r = await fetch("/api/dashboard/activity?type=referral_reward");
      return (await r.json()) as { items: Array<{ type: string; credits_granted: number }> };
    });
    expect(
      activity.items.some((i) => i.type === "referral_reward" && i.credits_granted === 5),
    ).toBe(true);
  });

  test("admin consoles have no accessibility violations", async ({ page, browser }) => {
    test.setTimeout(120000);
    const email = uniqueEmail("admin-a11y");
    const password = "correct-horse-battery-staple-123";
    // Signup + promotion in a throwaway context so the login below starts
    // from a fresh, unauthenticated /login — no SPA navigation races.
    const throwaway = await browser.newContext();
    const tp = await throwaway.newPage();
    await signupViaUI(tp, "Admin A11y", email, password);
    await promoteToAdmin(tp, email);
    await throwaway.close();
    await loginViaUI(page, email, password);
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    const engine = page.context().browser()!.browserType().name();
    for (const path of ["/admin", "/admin/users", "/admin/companies", "/admin/eft"]) {
      await page.goto(path);
      await expect(page.getByTestId("admin-nav")).toBeVisible({ timeout: 15000 });
      // Let in-flight session polls settle before scanning.
      await page.waitForLoadState("networkidle");
      // Upstream webkit/axe-core issue: axe.run never resolves against the
      // dense data tables under WebKit (whichever table-bearing page comes
      // second in the loop hangs, deterministic across runs and rule
      // subsets). Chromium fully scans the same DOM; webkit scans the
      // surrounding chrome so those surfaces stay covered.
      const builder =
        engine === "webkit" ? new AxeBuilder({ page }).exclude("table") : new AxeBuilder({ page });
      const results = await builder.analyze();
      expect(results.violations).toEqual([]);
    }
  });
});
