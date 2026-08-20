/**
 * Referral domain — ported from backend/referral_service.py
 * Referrer-only credits: referee gets 0, referrer earns on first paid subscription EFT.
 * Covers code generation, lookup, signup attribution, reward, and stats.
 */

import { eq } from "drizzle-orm";

import type { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { referrals, referralRewards } from "@/db/schema/referral";
import { user } from "@/db/schema/auth";
import {
  MONTHLY_REWARD_CAP,
  LIFETIME_REWARD_CAP,
  REFEREE_SIGNUP_BONUS,
  REF_ALPHABET,
  TIER_REWARDS,
} from "@/lib/eft";

type Db = ReturnType<typeof createDb>;

export { MONTHLY_REWARD_CAP, LIFETIME_REWARD_CAP, REFEREE_SIGNUP_BONUS, TIER_REWARDS };
export const REF_CODE_ALPHABET = REF_ALPHABET;

export function rewardForPlan(lookupKey: string | null | undefined): number {
  if (!lookupKey) return 0;
  return TIER_REWARDS[lookupKey] ?? 0;
}

function newReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * REF_ALPHABET.length);
    suffix += REF_ALPHABET[idx]!;
  }
  return `VEK-${suffix}`;
}

/**
 * Ensure the user has a unique referral code. Idempotent.
 * Retries 5 times on collision.
 */
export async function ensureReferralCode(db: Db, userId: string): Promise<string> {
  const rows = await (
    db.select().from(user).where as unknown as (c: unknown) => Promise<(typeof user.$inferSelect)[]>
  )(eq(user.id, userId));
  const existing = rows[0];
  if (!existing) throw new Error("User not found");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newReferralCode();
    const clash = await (
      db.select().from(user).where as unknown as (
        c: unknown,
      ) => Promise<(typeof user.$inferSelect)[]>
    )(eq(user.referralCode, code));
    if (clash.length === 0) {
      try {
        await (
          db.update(user).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({ referralCode: code, updatedAt: new Date() }).where(eq(user.id, userId));
        return code;
      } catch {
        // unique constraint violation -> retry
        continue;
      }
    }
  }
  throw new Error("Could not generate a unique referral code");
}

export interface ReferrerPreview {
  referrer_first_name: string;
  referrer_company?: string | null;
  signup_bonus_credits: number;
}

/**
 * Public lookup — only exposes first name + company, never email.
 */
export async function lookupReferrer(db: Db, refCode: string): Promise<ReferrerPreview | null> {
  const normalized = (refCode || "").trim().toUpperCase();
  if (!normalized) return null;
  const rows = await (
    db.select().from(user).where as unknown as (c: unknown) => Promise<(typeof user.$inferSelect)[]>
  )(eq(user.referralCode, normalized));
  const referrer = rows[0];
  if (!referrer) return null;

  const companyRows = await (
    db.select().from(companies).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companies.$inferSelect)[]>
  )(eq(companies.userId, referrer.id));
  // first company by createdAt asc
  companyRows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const company = companyRows[0];

  const rawName = (referrer.name || referrer.email.split("@")[0] || "").split(" ")[0] || "";
  const firstName = rawName.trim() || "A Vektor user";

  return {
    referrer_first_name: firstName,
    referrer_company: company?.companyName ?? null,
    signup_bonus_credits: REFEREE_SIGNUP_BONUS,
  };
}

/**
 * Store the referral link at signup time.
 * Guardrails: unknown code -> ignore, self-referral -> ignore, duplicate (first wins) -> ignore.
 * Returns referrerUserId if attribution succeeded, else null.
 */
export async function recordSignup(
  db: Db,
  refereeUserId: string,
  refereeEmail: string,
  refCode: string,
): Promise<string | null> {
  const normalized = (refCode || "").trim().toUpperCase();
  if (!normalized) return null;

  const referrerRows = await (
    db.select().from(user).where as unknown as (c: unknown) => Promise<(typeof user.$inferSelect)[]>
  )(eq(user.referralCode, normalized));
  const referrer = referrerRows[0];
  if (!referrer) return null;
  if (referrer.email.toLowerCase() === refereeEmail.toLowerCase()) return null;
  if (referrer.id === refereeUserId) return null;

  const refereeRows = await (
    db.select().from(user).where as unknown as (c: unknown) => Promise<(typeof user.$inferSelect)[]>
  )(eq(user.id, refereeUserId));
  const referee = refereeRows[0];
  if (!referee) return null;
  if (referee.referredByUserId) return null; // already referred, first wins

  const now = new Date();
  await (
    db.update(user).set as unknown as (v: unknown) => { where: (c: unknown) => Promise<unknown> }
  )({
    referredByUserId: referrer.id,
    referredByCode: normalized,
    referredAt: now,
    updatedAt: now,
  }).where(eq(user.id, refereeUserId));

  // Check if referral row already exists for this referee (unique constraint)
  const existingReferral = await (
    db.select().from(referrals).where as unknown as (
      c: unknown,
    ) => Promise<(typeof referrals.$inferSelect)[]>
  )(eq(referrals.refereeUserId, refereeUserId));
  if (existingReferral.length > 0) return null;

  const id = crypto.randomUUID();
  await db.insert(referrals).values({
    id,
    referrerUserId: referrer.id,
    refereeUserId,
    refereeEmail: refereeEmail.toLowerCase(),
    code: normalized,
    status: "signed_up",
    signupBonusGranted: false,
    referrerFirstPaidBonusGranted: false,
    referrerSubBonusGranted: false,
    createdAt: now,
  });

  return referrer.id;
}

async function rewardsUsedThisMonth(db: Db, referrerId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();
  try {
    const all = await (
      db.select().from(referralRewards).where as unknown as (
        c: unknown,
      ) => Promise<(typeof referralRewards.$inferSelect)[]>
    )(eq(referralRewards.referrerUserId, referrerId));
    return all.filter((r) => new Date(r.createdAt as unknown as Date).getTime() >= monthStartMs)
      .length;
  } catch {
    try {
      const all = (await db
        .select()
        .from(referralRewards)) as (typeof referralRewards.$inferSelect)[];
      return all
        .filter((r) => r.referrerUserId === referrerId)
        .filter((r) => new Date(r.createdAt as unknown as Date).getTime() >= monthStartMs).length;
    } catch {
      return 0;
    }
  }
}

async function rewardsUsedLifetime(db: Db, referrerId: string): Promise<number> {
  try {
    const all = await (
      db.select().from(referralRewards).where as unknown as (
        c: unknown,
      ) => Promise<(typeof referralRewards.$inferSelect)[]>
    )(eq(referralRewards.referrerUserId, referrerId));
    return all.length;
  } catch {
    try {
      const all = (await db
        .select()
        .from(referralRewards)) as (typeof referralRewards.$inferSelect)[];
      return all.filter((r) => r.referrerUserId === referrerId).length;
    } catch {
      return 0;
    }
  }
}

export interface RewardResult {
  granted: boolean;
  credits?: number;
  referrer_user_id?: string;
  plan_lookup_key?: string | null;
  type?: string;
  reason?: string;
}

/**
 * Called from the EFT admin confirm handler.
 * Referrer-only, first paid subscription only, respects caps, idempotent.
 */
export async function maybeRewardReferrerOnPaidEft(
  db: Db,
  args: {
    refereeUserId: string;
    isSubscription: boolean;
    triggerReference: string;
    planLookupKey?: string | null;
  },
): Promise<RewardResult | null> {
  const { refereeUserId, isSubscription, triggerReference, planLookupKey } = args;

  const refRows = await (
    db.select().from(referrals).where as unknown as (
      c: unknown,
    ) => Promise<(typeof referrals.$inferSelect)[]>
  )(eq(referrals.refereeUserId, refereeUserId));
  const ref = refRows[0];
  if (!ref) return null;
  if (ref.referrerFirstPaidBonusGranted) return null;

  if (!isSubscription) {
    return { granted: false, reason: "not_subscription" };
  }

  const creditsToGrant = rewardForPlan(planLookupKey ?? null);
  if (creditsToGrant <= 0) {
    return { granted: false, reason: "plan_not_rewardable" };
  }

  const referrerId = ref.referrerUserId;

  const monthly = await rewardsUsedThisMonth(db, referrerId);
  const lifetime = await rewardsUsedLifetime(db, referrerId);
  const now = new Date();

  if (monthly >= MONTHLY_REWARD_CAP) {
    await (
      db.update(referrals).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({
      status: "capped",
      cappedAt: now,
      capReason: "monthly",
    }).where(eq(referrals.id, ref.id));
    return { granted: false, reason: "monthly_cap" };
  }
  if (lifetime >= LIFETIME_REWARD_CAP) {
    await (
      db.update(referrals).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({
      status: "capped",
      cappedAt: now,
      capReason: "lifetime",
    }).where(eq(referrals.id, ref.id));
    return { granted: false, reason: "lifetime_cap" };
  }

  const referrerCompanyRows = await (
    db.select().from(companies).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companies.$inferSelect)[]>
  )(eq(companies.userId, referrerId));
  referrerCompanyRows.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const referrerCompany = referrerCompanyRows[0];

  if (!referrerCompany) {
    await (
      db.update(referrals).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({
      status: "pending_referrer_company",
      pendingReferrerCredits: creditsToGrant,
      pendingPlanLookupKey: planLookupKey ?? null,
    }).where(eq(referrals.id, ref.id));
    return { granted: false, reason: "referrer_has_no_company" };
  }

  // Grant credits to referrer's primary company
  const creditRows = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, referrerCompany.id));
  const existing = creditRows[0];
  const current = existing?.credits ?? 0;
  if (existing) {
    await (
      db.update(companyCredits).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({ credits: current + creditsToGrant, updatedAt: now }).where(
      eq(companyCredits.companyId, referrerCompany.id),
    );
  } else {
    await db.insert(companyCredits).values({
      companyId: referrerCompany.id,
      credits: creditsToGrant,
      updatedAt: now,
    });
  }

  const rewardId = crypto.randomUUID();
  await db.insert(referralRewards).values({
    id: rewardId,
    referrerUserId: referrerId,
    refereeUserId,
    referrerCompanyId: referrerCompany.id,
    creditsGranted: creditsToGrant,
    type: "first_paid_subscription",
    planLookupKey: planLookupKey ?? null,
    triggerReference,
    createdAt: now,
  });

  await (
    db.update(referrals).set as unknown as (v: unknown) => {
      where: (c: unknown) => Promise<unknown>;
    }
  )({
    status: "first_paid_subscription",
    referrerFirstPaidBonusGranted: true,
    referrerSubBonusGranted: true,
    firstPaidAt: now,
    firstPaidPlanLookupKey: planLookupKey ?? null,
  }).where(eq(referrals.id, ref.id));

  return {
    granted: true,
    credits: creditsToGrant,
    referrer_user_id: referrerId,
    plan_lookup_key: planLookupKey ?? null,
    type: "first_paid_subscription",
  };
}

export interface ReferralStats {
  code: string;
  invited_count: number;
  paid_count: number;
  subscribed_count: number;
  credits_earned: number;
  monthly_used: number;
  monthly_cap: number;
  monthly_remaining: number;
  lifetime_used: number;
  lifetime_cap: number;
  lifetime_remaining: number;
  reward_config: {
    referee_signup_bonus: number;
    tier_rewards: Record<string, number>;
  };
  recent: Array<{
    referee_email: string;
    status: string;
    created_at: string;
    first_paid_at: string | null;
  }>;
}

/**
 * Dashboard stats for a user's referral tab.
 */
export async function myStats(db: Db, userId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(db, userId);

  const invitedRows = await (
    db.select().from(referrals).where as unknown as (
      c: unknown,
    ) => Promise<(typeof referrals.$inferSelect)[]>
  )(eq(referrals.referrerUserId, userId));
  const invited = invitedRows.length;
  const paid = invitedRows.filter((r) => r.referrerFirstPaidBonusGranted).length;
  const subscribed = invitedRows.filter((r) => r.referrerSubBonusGranted).length;

  let creditsEarned = 0;
  try {
    const allRewards = await (
      db.select().from(referralRewards).where as unknown as (
        c: unknown,
      ) => Promise<(typeof referralRewards.$inferSelect)[]>
    )(eq(referralRewards.referrerUserId, userId));
    creditsEarned = allRewards.reduce((sum, rr) => sum + (rr.creditsGranted ?? 0), 0);
  } catch {
    creditsEarned = 0;
  }

  const monthlyUsed = await rewardsUsedThisMonth(db, userId);
  const lifetimeUsed = await rewardsUsedLifetime(db, userId);

  // recent 10 sorted by createdAt desc
  const sorted = [...invitedRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const recentRaw = sorted.slice(0, 10);
  const recent = recentRaw.map((r) => {
    let email = r.refereeEmail || "";
    if (email.includes("@")) {
      const [local, domain] = email.split("@", 2) as [string, string];
      if (local.length > 3) email = `${local.slice(0, 2)}***@${domain}`;
    }
    return {
      referee_email: email,
      status: r.status,
      created_at: new Date(r.createdAt).toISOString(),
      first_paid_at: r.firstPaidAt ? new Date(r.firstPaidAt).toISOString() : null,
    };
  });

  return {
    code,
    invited_count: invited,
    paid_count: paid,
    subscribed_count: subscribed,
    credits_earned: creditsEarned,
    monthly_used: monthlyUsed,
    monthly_cap: MONTHLY_REWARD_CAP,
    monthly_remaining: Math.max(0, MONTHLY_REWARD_CAP - monthlyUsed),
    lifetime_used: lifetimeUsed,
    lifetime_cap: LIFETIME_REWARD_CAP,
    lifetime_remaining: Math.max(0, LIFETIME_REWARD_CAP - lifetimeUsed),
    reward_config: {
      referee_signup_bonus: REFEREE_SIGNUP_BONUS,
      tier_rewards: TIER_REWARDS,
    },
    recent,
  };
}
