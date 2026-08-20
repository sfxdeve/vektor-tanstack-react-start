/**
 * Referral domain — ported from backend/referral_service.py
 * Referrer-only credits: referee gets 0, referrer earns on first paid subscription EFT.
 * Covers code generation, lookup, signup attribution, reward, and stats.
 *
 * Notes on port decisions:
 * - Monthly cap is evaluated in UTC (D1 stores timestamps as UTC). Spec's
 *   "calendar month" is therefore a UTC calendar month; SAST (UTC+2) vs UTC
 *   differs only at month boundaries and is documented here for transparency.
 * - pending_referrer_company handling is preserved from the Python source - if
 *   the referrer has no company at reward time, the reward is parked on the
 *   referrals row for manual grant later, rather than failing the EFT confirm.
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
  TIER_REWARDS,
  generateReference,
} from "@/lib/eft";

type Db = ReturnType<typeof createDb>;

export { MONTHLY_REWARD_CAP, LIFETIME_REWARD_CAP, REFEREE_SIGNUP_BONUS, TIER_REWARDS };

export function rewardForPlan(lookupKey: string | null | undefined): number {
  if (!lookupKey) return 0;
  return TIER_REWARDS[lookupKey] ?? 0;
}

// ---------------------------------------------------------------------------
// Small DB helper to hide the Drizzle cast + fallback pattern that otherwise
// repeats in every query. Keeps call sites readable and avoids Shotgun Surgery
// if the DB shim changes.
// ---------------------------------------------------------------------------
async function selectWhere<T>(
  db: Db,
  table: unknown,
  eqCond: unknown,
  fallbackFilter: (rows: T[]) => T[],
): Promise<T[]> {
  try {
    const rows = await (
      db.select().from(table as never).where as unknown as (c: unknown) => Promise<T[]>
    )(eqCond as never);
    return rows;
  } catch {
    const all = (await (db.select().from(table as never) as unknown as Promise<T[]>)) as T[];
    return fallbackFilter(all);
  }
}

// ---------------------------------------------------------------------------
// Referral code generation - reuses the canonical EFT reference generator so
// the VEK-XXXXXX alphabet stays single-sourced (Duplicated Code fix).
// ---------------------------------------------------------------------------

/**
 * Ensure the user has a unique referral code. Idempotent.
 * Retries 5 times on collision.
 */
export async function ensureReferralCode(db: Db, userId: string): Promise<string> {
  const rows = await selectWhere<typeof user.$inferSelect>(db, user, eq(user.id, userId), (all) =>
    all.filter((r) => r.id === userId),
  );
  const existing = rows[0];
  if (!existing) throw new Error("User not found");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReference();
    const clash = await selectWhere<typeof user.$inferSelect>(
      db,
      user,
      eq(user.referralCode, code),
      (all) => all.filter((r) => r.referralCode === code),
    );
    if (clash.length === 0) {
      try {
        await (
          db.update(user).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )({ referralCode: code, updatedAt: new Date() }).where(eq(user.id, userId));
        return code;
      } catch {
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
  const rows = await selectWhere<typeof user.$inferSelect>(
    db,
    user,
    eq(user.referralCode, normalized),
    (all) => all.filter((r) => r.referralCode === normalized),
  );
  const referrer = rows[0];
  if (!referrer) return null;

  const companyRows = await selectWhere<typeof companies.$inferSelect>(
    db,
    companies,
    eq(companies.userId, referrer.id),
    (all) => all.filter((r) => r.userId === referrer.id),
  );
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

  const referrerRows = await selectWhere<typeof user.$inferSelect>(
    db,
    user,
    eq(user.referralCode, normalized),
    (all) => all.filter((r) => r.referralCode === normalized),
  );
  const referrer = referrerRows[0];
  if (!referrer) return null;
  if (referrer.email.toLowerCase() === refereeEmail.toLowerCase()) return null;
  if (referrer.id === refereeUserId) return null;

  const refereeRows = await selectWhere<typeof user.$inferSelect>(
    db,
    user,
    eq(user.id, refereeUserId),
    (all) => all.filter((r) => r.id === refereeUserId),
  );
  const referee = refereeRows[0];
  if (!referee) return null;
  if (referee.referredByUserId) return null;

  const now = new Date();
  await (
    db.update(user).set as unknown as (v: unknown) => { where: (c: unknown) => Promise<unknown> }
  )({
    referredByUserId: referrer.id,
    referredByCode: normalized,
    referredAt: now,
    updatedAt: now,
  }).where(eq(user.id, refereeUserId));

  const existingReferral = await selectWhere<typeof referrals.$inferSelect>(
    db,
    referrals,
    eq(referrals.refereeUserId, refereeUserId),
    (all) => all.filter((r) => r.refereeUserId === refereeUserId),
  );
  if (existingReferral.length > 0) return null;

  const id = crypto.randomUUID();
  try {
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
  } catch {
    // Unique violation (concurrent first-code-wins) — treat as already attributed
    return null;
  }

  return referrer.id;
}

async function rewardsUsedThisMonth(db: Db, referrerId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();
  const all = await selectWhere<typeof referralRewards.$inferSelect>(
    db,
    referralRewards,
    eq(referralRewards.referrerUserId, referrerId),
    (rows) => rows.filter((r) => r.referrerUserId === referrerId),
  );
  return all.filter((r) => new Date(r.createdAt as unknown as Date).getTime() >= monthStartMs)
    .length;
}

async function rewardsUsedLifetime(db: Db, referrerId: string): Promise<number> {
  const all = await selectWhere<typeof referralRewards.$inferSelect>(
    db,
    referralRewards,
    eq(referralRewards.referrerUserId, referrerId),
    (rows) => rows.filter((r) => r.referrerUserId === referrerId),
  );
  return all.length;
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
 * Monthly cap is evaluated in UTC; see module header for SAST note.
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

  const refRows = await selectWhere<typeof referrals.$inferSelect>(
    db,
    referrals,
    eq(referrals.refereeUserId, refereeUserId),
    (all) => all.filter((r) => r.refereeUserId === refereeUserId),
  );
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

  // Caps are per-referrer, not per-invitee. Marking the specific referrals row
  // as capped is informational (mirrors Python) but does not block other invitees
  // next month - a new referrals row will be counted separately.
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

  const referrerCompanyRows = await selectWhere<typeof companies.$inferSelect>(
    db,
    companies,
    eq(companies.userId, referrerId),
    (all) => all.filter((r) => r.userId === referrerId),
  );
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

  const creditRows = await selectWhere<typeof companyCredits.$inferSelect>(
    db,
    companyCredits,
    eq(companyCredits.companyId, referrerCompany.id),
    (all) => all.filter((r) => r.companyId === referrerCompany.id),
  );
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

  const invitedRows = await selectWhere<typeof referrals.$inferSelect>(
    db,
    referrals,
    eq(referrals.referrerUserId, userId),
    (all) => all.filter((r) => r.referrerUserId === userId),
  );
  const invited = invitedRows.length;
  const paid = invitedRows.filter((r) => r.referrerFirstPaidBonusGranted).length;
  const subscribed = invitedRows.filter((r) => r.referrerSubBonusGranted).length;

  const allRewards = await selectWhere<typeof referralRewards.$inferSelect>(
    db,
    referralRewards,
    eq(referralRewards.referrerUserId, userId),
    (all) => all.filter((r) => r.referrerUserId === userId),
  );
  const creditsEarned = allRewards.reduce((sum, rr) => sum + (rr.creditsGranted ?? 0), 0);

  const monthlyUsed = await rewardsUsedThisMonth(db, userId);
  const lifetimeUsed = await rewardsUsedLifetime(db, userId);

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
