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

export const TIER_REWARDS: Record<string, number> = {
  tc_starter_monthly_v2: 3,
  tc_pro_monthly_v2: 5,
  tc_scale_monthly_v2: 10,
};

export const MONTHLY_REWARD_CAP = 5;
export const LIFETIME_REWARD_CAP = 20;
export const REFEREE_SIGNUP_BONUS = 0;

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

export function getBankDetails(env: Record<string, string | undefined>): BankDetails {
  const strip = (v: string | undefined) => (v ?? "").trim().replace(/^"+|"+$/g, "");
  const bank_name = strip(env.EFT_BANK_NAME) || "First National Bank";
  const account_holder = strip(env.EFT_ACCOUNT_HOLDER) || "EcoBuiltConnect (Pty) Ltd";
  const account_number = strip(env.EFT_ACCOUNT_NUMBER) || "62712345678";
  const branch_code = strip(env.EFT_BRANCH_CODE) || "250655";
  const account_type = strip(env.EFT_ACCOUNT_TYPE) || "Cheque";
  return { bank_name, account_holder, account_number, branch_code, account_type };
}

export const ALLOWED_PROOF_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export function extForContentType(contentType: string): string | null {
  return ALLOWED_PROOF_TYPES[contentType.toLowerCase()] ?? null;
}
