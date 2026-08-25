import { describe, expect, it } from "vitest";

import {
  LIFETIME_REWARD_CAP,
  MONTHLY_REWARD_CAP,
  isSelfReferral,
  rewardForPlan,
} from "@/lib/referral";

describe("referral reward rules", () => {
  it("maps only paid subscription tiers to rewards", () => {
    expect(rewardForPlan("tc_starter_monthly_v2")).toBe(3);
    expect(rewardForPlan("tc_pro_monthly_v2")).toBe(5);
    expect(rewardForPlan("tc_scale_monthly_v2")).toBe(10);
    expect(rewardForPlan("tc_credits_1_v2")).toBe(0);
    expect(rewardForPlan("unknown")).toBe(0);
  });

  it("preserves monthly and lifetime reward caps", () => {
    expect(MONTHLY_REWARD_CAP).toBe(5);
    expect(LIFETIME_REWARD_CAP).toBe(20);
  });

  it("blocks matching user ids or case-insensitive email identities", () => {
    expect(
      isSelfReferral(
        { id: "user-1", email: "first@example.com" },
        { id: "user-1", email: "other@example.com" },
      ),
    ).toBe(true);
    expect(
      isSelfReferral(
        { id: "user-1", email: "Alice@Example.com" },
        { id: "user-2", email: "alice@example.COM" },
      ),
    ).toBe(true);
    expect(
      isSelfReferral(
        { id: "user-1", email: "alice@example.com" },
        { id: "user-2", email: "bob@example.com" },
      ),
    ).toBe(false);
  });
});
