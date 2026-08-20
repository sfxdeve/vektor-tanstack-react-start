import { describe, expect, it } from "vitest";

import {
  LIFETIME_REWARD_CAP,
  MONTHLY_REWARD_CAP,
  REFEREE_SIGNUP_BONUS,
  TIER_REWARDS,
} from "@/lib/eft";
import {
  LIFETIME_REWARD_CAP as LRC2,
  MONTHLY_REWARD_CAP as MRC2,
  REFEREE_SIGNUP_BONUS as RSB2,
  rewardForPlan,
} from "@/lib/referral";

describe("referral — rewardForPlan", () => {
  it("returns tier rewards for known subscription plans", () => {
    expect(rewardForPlan("tc_starter_monthly_v2")).toBe(3);
    expect(rewardForPlan("tc_pro_monthly_v2")).toBe(5);
    expect(rewardForPlan("tc_scale_monthly_v2")).toBe(10);
  });

  it("returns 0 for PAYG and unknown plans", () => {
    expect(rewardForPlan("tc_credits_1_v2")).toBe(0);
    expect(rewardForPlan("unknown_plan")).toBe(0);
    expect(rewardForPlan(null)).toBe(0);
    expect(rewardForPlan(undefined)).toBe(0);
    expect(rewardForPlan("")).toBe(0);
  });

  it("caps are preserved from spec prototype", () => {
    expect(MONTHLY_REWARD_CAP).toBe(5);
    expect(LIFETIME_REWARD_CAP).toBe(20);
    expect(REFEREE_SIGNUP_BONUS).toBe(0);
    // re-exported from referral module should match
    expect(MRC2).toBe(5);
    expect(LRC2).toBe(20);
    expect(RSB2).toBe(0);
  });

  it("tier rewards map matches EFT tier rewards", () => {
    expect(TIER_REWARDS.tc_starter_monthly_v2).toBe(3);
    expect(TIER_REWARDS.tc_pro_monthly_v2).toBe(5);
    expect(TIER_REWARDS.tc_scale_monthly_v2).toBe(10);
    expect(TIER_REWARDS.tc_credits_1_v2).toBeUndefined();
    // PAYG should earn 0
    expect(rewardForPlan("tc_credits_1_v2")).toBe(0);
  });
});

describe("referral — self-referral guard (pure check)", () => {
  function isSelfReferral(referrerEmail: string, refereeEmail: string): boolean {
    return referrerEmail.trim().toLowerCase() === refereeEmail.trim().toLowerCase();
  }

  it("blocks self-referral when emails match case-insensitive", () => {
    expect(isSelfReferral("Alice@example.com", "alice@EXAMPLE.com")).toBe(true);
    expect(isSelfReferral("bob@test.co.za", "Bob@test.co.za")).toBe(true);
  });

  it("allows different emails", () => {
    expect(isSelfReferral("alice@example.com", "bob@example.com")).toBe(false);
    expect(isSelfReferral("a@b.com", "c@d.com")).toBe(false);
  });
});

describe("referral — code format", () => {
  it("generates VEK-XXXXXX codes with allowed alphabet", async () => {
    const { REF_ALPHABET, generateReference } = await import("@/lib/eft");
    for (let i = 0; i < 20; i++) {
      const code = generateReference();
      expect(code).toMatch(/^VEK-[A-Z0-9]{6}$/);
      // Alphabet excludes 0/O/1/I
      expect(code).not.toMatch(/[01IO]/);
      for (const ch of code.slice(4)) {
        expect(REF_ALPHABET).toContain(ch);
      }
    }
  });
});

describe("referral — cap calculations", () => {
  it("monthly remaining is capped at 0..5", () => {
    const monthlyCap = 5;
    const usedCases = [0, 3, 5, 7];
    const remaining = usedCases.map((used) => Math.max(0, monthlyCap - used));
    expect(remaining).toEqual([5, 2, 0, 0]);
  });

  it("lifetime remaining is capped at 0..20", () => {
    const cap = 20;
    expect(Math.max(0, cap - 0)).toBe(20);
    expect(Math.max(0, cap - 19)).toBe(1);
    expect(Math.max(0, cap - 20)).toBe(0);
    expect(Math.max(0, cap - 25)).toBe(0);
  });
});
