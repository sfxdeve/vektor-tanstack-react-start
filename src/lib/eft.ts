/**
 * EFT domain helpers — reference generation, status machine, bank details.
 * Ported from backend/eft_service.py
 */

export const EFT_STATUS = {
  AWAITING_PROOF: "awaiting_proof",
  PENDING_REVIEW: "pending_review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
} as const;

export type EftStatus = (typeof EFT_STATUS)[keyof typeof EFT_STATUS];

export const ALLOWED_TRANSITIONS: Record<EftStatus, EftStatus[]> = {
  awaiting_proof: ["pending_review"],
  pending_review: ["confirmed", "rejected"],
  rejected: ["pending_review"],
  confirmed: [],
};

export const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReference(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * REF_ALPHABET.length);
    suffix += REF_ALPHABET[idx]!;
  }
  return `VEK-${suffix}`;
}

export interface BankDetails {
  bank_name: string;
  account_holder: string;
  account_number: string;
  branch_code: string;
  account_type: string;
}

/**
 * Read bank details from env. Only account_type defaults ("Cheque"), matching
 * backend/eft_service.py — the real account fields come from EFT_* secrets and
 * are intentionally blank when unset so a misconfigured deploy is visible.
 */
export function getBankDetails(env: {
  EFT_BANK_NAME?: string;
  EFT_ACCOUNT_HOLDER?: string;
  EFT_ACCOUNT_NUMBER?: string;
  EFT_BRANCH_CODE?: string;
  EFT_ACCOUNT_TYPE?: string;
}): BankDetails {
  const strip = (v: string | undefined) => (v ?? "").trim().replace(/^"+|"+$/g, "");
  return {
    bank_name: strip(env.EFT_BANK_NAME),
    account_holder: strip(env.EFT_ACCOUNT_HOLDER),
    account_number: strip(env.EFT_ACCOUNT_NUMBER),
    branch_code: strip(env.EFT_BRANCH_CODE),
    account_type: strip(env.EFT_ACCOUNT_TYPE) || "Cheque",
  };
}

export const ALLOWED_PROOF_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/**
 * Rollover rule for subscriptions: unused credits bank up to 2× the monthly
 * allowance (annual plans are not in the catalog). Single source used by the
 * EFT confirm handler and the Billing page hint.
 */
export function rolloverCapForCycleCredits(cycleCredits: number): number {
  return cycleCredits * 2;
}
