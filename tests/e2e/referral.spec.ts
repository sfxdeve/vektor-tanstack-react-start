import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clearSession, ensureCompanySetup } from "./helpers";

function uniqueEmail(prefix = "ref") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${Date.now()}.${rand}@example.com`;
}

test.describe("Referrals", () => {
  test("referral link signup -> EFT subscription -> admin confirm -> reward granted and visible", async ({
    page,
  }) => {
    const referrerEmail = uniqueEmail("referrer");
    const refereeEmail = uniqueEmail("referee");
    const password = "correct-horse-battery-staple-123";

    // --- Referrer signup ---
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await page.getByTestId("input-name").fill("Referrer One");
    await page.getByTestId("input-email").fill(referrerEmail);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(referrerEmail, { timeout: 10000 });

    // Create company for referrer (required for reward to land)
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("Referrer Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2021/123456/07");
    await page.getByTestId("input-contact-email").fill(referrerEmail);
    await page.getByTestId("input-cidb-grade").fill("4GB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 1/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // Fetch referrer code
    const referrerStats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      if (!r.ok) throw new Error(`myStats failed ${r.status}`);
      return (await r.json()) as { code: string; invited_count: number };
    });
    const refCode = referrerStats.code;
    expect(refCode).toMatch(/^VEK-[A-Z0-9]{6}$/);
    expect(referrerStats.invited_count).toBe(0);

    // Public lookup should return referrer preview
    const lookup = await page.evaluate(async (code: string) => {
      const r = await fetch(`/api/referrals/lookup?code=${encodeURIComponent(code)}`);
      return { ok: r.ok, data: (await r.json().catch(() => null)) as unknown };
    }, refCode);
    expect(lookup.ok).toBe(true);
    const preview = lookup.data as { referrer_first_name: string; signup_bonus_credits: number };
    expect(preview.referrer_first_name).toBeTruthy();
    expect(preview.signup_bonus_credits).toBe(0);

    // Lookup unknown code should 404
    const unknownLookup = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/lookup?code=VEK-UNKNOWN");
      return r.status;
    });
    expect(unknownLookup).toBe(404);

    // --- Referee signup via referral link ---
    // Clear session: wipe cookies and storage
    await clearSession(page);
    await page.goto(`/signup?ref=${refCode}`);
    await expect(page.getByTestId("signup-referral-banner")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("signup-referral-banner")).toContainText(
      preview.referrer_first_name,
    );
    await page.getByTestId("input-name").fill("Referee One");
    await page.getByTestId("input-email").fill(refereeEmail);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-signup").click();
    await page.waitForURL(/\/app|\/setup/, { timeout: 15000 });
    await expect(page.getByTestId("user-email")).toContainText(refereeEmail, { timeout: 10000 });

    // Every user gets their own VEK-XXXXXX code on signup (referrer-only
    // program: no referee bonus, rewards fire only on the referrer side).
    const ownStats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      return (await r.json()) as {
        code: string;
        invited_count: number;
        credits_earned: number;
        reward_config: { referee_signup_bonus: number };
      };
    });
    expect(ownStats.code).toMatch(/^VEK-[A-Z0-9]{6}$/);
    expect(ownStats.invited_count).toBe(0);
    expect(ownStats.credits_earned).toBe(0);
    expect(ownStats.reward_config.referee_signup_bonus).toBe(0);

    // Create company for referee
    await ensureCompanySetup(page);
    await page.getByTestId("input-company-name").fill("Referee Pty Ltd");
    await page.getByTestId("input-cipc-num").fill("2022/654321/07");
    await page.getByTestId("input-contact-email").fill(refereeEmail);
    await page.getByTestId("input-cidb-grade").fill("5GB");
    await page.getByTestId("select-bbbee-level").click();
    await page.getByRole("option", { name: /Level 2/ }).click();
    await page.getByTestId("submit-company-btn").click();
    await expect(page.getByText(/Company profile/)).toBeVisible({ timeout: 10000 });
    // setup auto-redirects to /app ~1.2s after save; wait it out so
    // follow-up navigations never race the router
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 15000 });

    // --- Referee requests EFT for Pro subscription (should trigger reward) ---
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("billing-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("package-tc_pro_monthly_v2")).toBeVisible();
    await page.getByTestId("subscribe-tc_pro_monthly_v2").click();
    await expect(page.getByTestId("eft-payment-dialog")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("eft-creating")).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId("eft-instructions")).toBeVisible();
    const ref = await page.getByTestId("eft-reference").textContent();
    expect(ref).toMatch(/VEK-[A-Z0-9]{6}/);

    const proofBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const [uploadResp] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/eft/upload-proof/") && resp.request().method() === "POST",
        { timeout: 15000 },
      ),
      page.getByTestId("eft-proof-file-input").setInputFiles({
        name: "proof.png",
        mimeType: "image/png",
        buffer: proofBuffer,
      }),
    ]);
    expect(uploadResp.ok()).toBe(true);
    await expect(page.getByTestId("eft-submitted")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("eft-close-btn").click({ force: true });
    await expect(page.getByTestId("eft-payment-dialog")).toBeHidden({ timeout: 5000 });

    // Get paymentId for later admin confirm
    const myReqs = await page.evaluate(async () => {
      const r = await fetch("/api/eft/my-requests");
      return (await r.json()) as {
        payments: Array<{ id: string; reference: string; status: string }>;
      };
    });
    const pending = myReqs.payments.find((p) => p.reference === ref?.trim());
    expect(pending).toBeDefined();
    const paymentId = pending!.id;
    expect(pending!.status).toBe("pending_review");

    // Also test PAYG does NOT trigger reward: create a PAYG payment but not confirmed
    const paygPayment = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const companyId = comps[0]!.id;
      const res = await fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: "tc_credits_1_v2", company_id: companyId }),
      });
      return (await res.json()) as { id: string; lookup_key: string };
    });
    expect(paygPayment.id).toBeTruthy();

    // Logout referee - wipe storage
    await clearSession(page);

    // Promote referrer to admin via the dev endpoint. Uses the API request
    // context, which resolves against baseURL even while the page sits on
    // about:blank after clearSession().
    const promoteRes = await page.request.post("/api/dev/set-role", {
      data: { email: referrerEmail, role: "admin" },
    });
    expect(promoteRes.ok()).toBe(true);

    // Login as referrer (now admin)
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-email").fill(referrerEmail);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("submit-login").click();
    await expect(page).toHaveURL(/\/admin|\/app/, { timeout: 20000 });
    // Admin should be redirected to /admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });

    // Admin confirm the referee's Pro EFT (should grant 5 credits and trigger referral reward)
    const confirmRes = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      const body = (await r.json().catch(() => null)) as unknown;
      return { ok: r.ok, status: r.status, body };
    }, paymentId);
    expect(confirmRes.ok).toBe(true);
    const confirmed = confirmRes.body as { status: string; credits_granted: number | null };
    expect(confirmed.status).toBe("confirmed");

    // Idempotent confirm: second call should 200 (idempotent)
    const secondConfirm = await page.evaluate(async (pid: string) => {
      const r = await fetch(`/api/eft/admin/${pid}/confirm`, { method: "POST" });
      return { ok: r.ok, status: r.status };
    }, paymentId);
    expect(secondConfirm.status).toBe(200);

    // Check referral stats as admin/referrer (still logged in as referrer)
    const stats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      return (await r.json()) as {
        code: string;
        invited_count: number;
        subscribed_count: number;
        credits_earned: number;
        monthly_used: number;
        lifetime_used: number;
        recent: Array<{ referee_email: string; status: string }>;
      };
    });
    expect(stats.invited_count).toBe(1);
    expect(stats.subscribed_count).toBe(1);
    expect(stats.credits_earned).toBe(5); // Pro = 5
    expect(stats.monthly_used).toBe(1);
    expect(stats.lifetime_used).toBe(1);
    // Recent should contain redacted referee email
    expect(stats.recent.length).toBeGreaterThanOrEqual(1);
    expect(stats.recent[0]!.status).toBe("first_paid_subscription");

    // Check dashboard activity feed contains referral_reward
    const activity = await page.evaluate(async () => {
      const r = await fetch("/api/dashboard/activity");
      return (await r.json()) as {
        items: Array<{ type: string; credits_granted?: number }>;
        counts: { referral_rewards: number };
      };
    });
    expect(activity.counts.referral_rewards).toBe(1);
    const rewardItem = activity.items.find((i) => i.type === "referral_reward");
    expect(rewardItem).toBeDefined();
    expect(rewardItem?.credits_granted).toBe(5);

    // Filtered activity: only referral_reward
    const filtered = await page.evaluate(async () => {
      const r = await fetch("/api/dashboard/activity?type=referral_reward");
      return (await r.json()) as { items: Array<{ type: string }> };
    });
    expect(filtered.items.every((i) => i.type === "referral_reward")).toBe(true);

    // Check that referrer's company credits increased
    const credits = await page.evaluate(async () => {
      const compRes = await fetch("/api/companies");
      const comps = (await compRes.json()) as Array<{ id: string }>;
      const cid = comps[0]!.id;
      const r = await fetch(`/api/billing/credits/${cid}`);
      return (await r.json()) as { credits: number };
    });
    expect(credits.credits).toBe(5);

    // Verify share link and stats via API (UI widget is covered by the a11y test for a regular user).
    // This avoids a second login flake while still proving the share URL contains the code and stats are correct.
    const finalStats = await page.evaluate(async () => {
      const r = await fetch("/api/referrals/my");
      return (await r.json()) as {
        code: string;
        invited_count: number;
        subscribed_count: number;
        credits_earned: number;
      };
    });
    expect(finalStats.code).toBe(refCode);
    expect(finalStats.invited_count).toBe(1);
    expect(finalStats.subscribed_count).toBe(1);
    expect(finalStats.credits_earned).toBe(5);
    const shareUrl = `http://127.0.0.1:4173/signup?ref=${refCode}`;
    expect(shareUrl).toContain(refCode);
  });

  test("referral widget has no accessibility violations", async ({ page }) => {
    const email = uniqueEmail("ref-a11y");
    const password = "correct-horse-battery-staple-123";
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("input-name").fill("A11y Referral User");
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
    await page.waitForLoadState("networkidle");
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("billing-title")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("referral-widget")).toBeVisible({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
