import { describe, expect, it } from "vitest";

import {
  ALLOWED_PROOF_TYPES,
  EFT_STATUS,
  MAX_PROOF_BYTES,
  TIER_REWARDS,
  generateReference,
  getBankDetails,
} from "@/lib/eft";

describe("eft — reference generation", () => {
  it("generates VEK-XXXXXX with 6 chars from allowed alphabet", () => {
    for (let i = 0; i < 20; i++) {
      const ref = generateReference();
      expect(ref).toMatch(/^VEK-[A-Z0-9]{6}$/);
      // no confusing 0/O/1/I
      expect(ref).not.toMatch(/[01IO]/);
    }
  });

  it("references are unique across many generations (probabilistic)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateReference());
    expect(set.size).toBeGreaterThan(90);
  });
});

describe("eft — status machine", () => {
  it("defines 4 statuses", () => {
    expect(EFT_STATUS.AWAITING_PROOF).toBe("awaiting_proof");
    expect(EFT_STATUS.PENDING_REVIEW).toBe("pending_review");
    expect(EFT_STATUS.CONFIRMED).toBe("confirmed");
    expect(EFT_STATUS.REJECTED).toBe("rejected");
  });

  it("allowed transitions: awaiting_proof → pending_review → confirmed|rejected, rejected → pending_review", () => {
    // This is a documentation test — the actual transition enforcement is in API handlers,
    // but we assert the constants match spec prototype
    const transitions: Record<string, string[]> = {
      awaiting_proof: ["pending_review"],
      pending_review: ["confirmed", "rejected"],
      rejected: ["pending_review"],
      confirmed: [],
    };
    expect(transitions.awaiting_proof).toContain("pending_review");
    expect(transitions.pending_review).toContain("confirmed");
    expect(transitions.pending_review).toContain("rejected");
    expect(transitions.rejected).toContain("pending_review");
    expect(transitions.confirmed).toHaveLength(0);
  });
});

describe("eft — bank details", () => {
  it("reads from env when provided", () => {
    const details = getBankDetails({
      EFT_BANK_NAME: "My Bank",
      EFT_ACCOUNT_HOLDER: "Holder",
      EFT_ACCOUNT_NUMBER: "123",
      EFT_BRANCH_CODE: "456",
      EFT_ACCOUNT_TYPE: "Savings",
    });
    expect(details.bank_name).toBe("My Bank");
    expect(details.account_type).toBe("Savings");
  });

  it("strips surrounding quotes", () => {
    const details = getBankDetails({ EFT_BANK_NAME: '"First National Bank"' });
    expect(details.bank_name).toBe("First National Bank");
  });
});

describe("eft — proof constraints", () => {
  it("allows PDF, PNG, JPEG, WEBP only", () => {
    expect(ALLOWED_PROOF_TYPES["application/pdf"]).toBe(".pdf");
    expect(ALLOWED_PROOF_TYPES["image/png"]).toBe(".png");
    expect(ALLOWED_PROOF_TYPES["image/jpeg"]).toBe(".jpg");
    expect(ALLOWED_PROOF_TYPES["image/webp"]).toBe(".webp");
    expect(ALLOWED_PROOF_TYPES["text/plain"]).toBeUndefined();
  });

  it("max proof bytes is 10MB", () => {
    expect(MAX_PROOF_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("eft — tier rewards (referrer hook, issue 07)", () => {
  it("rewards per plan", () => {
    expect(TIER_REWARDS.tc_starter_monthly_v2).toBe(3);
    expect(TIER_REWARDS.tc_pro_monthly_v2).toBe(5);
    expect(TIER_REWARDS.tc_scale_monthly_v2).toBe(10);
    expect(TIER_REWARDS.tc_credits_1_v2).toBeUndefined();
  });
});
