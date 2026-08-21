/**
 * Referral domain — ported from backend/referral_service.py.
 * Referrer-only credits: referee gets 0, referrer earns on the invitee's
 * first paid subscription EFT confirmed by an admin.
 *
 * Guardrails (verbatim from the old service):
 *   - first code wins (a user can be referred only once)
 *   - self-referral blocked
 *   - rewards gated behind admin EFT confirmation
 *   - max 5 rewards per referrer per calendar month (UTC), 20 lifetime
 *
 * If the referrer has no company at reward time, the reward is parked on the
 * referrals row (pending_referrer_company) rather than failing the confirm.
 */

import { and, eq, gte, sql } from "drizzle-orm";

import type { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { referrals, referralRewards } from "@/db/schema/referral";
import {
  LIFETIME_REWARD_CAP,
  MONTHLY_REWARD_CAP,
  REFEREE_SIGNUP_BONUS,
  TIER_REWARDS,
  generateReference,
} from "@/lib/eft";

export { LIFETIME_REWARD_CAP, MONTHLY_REWARD_CAP, REFEREE_SIGNUP_BONUS, TIER_REWARDS };

export function rewardForPlan(lookupKey: string | null | undefined): number {
  if (!lookupKey) return 0;
  return TIER_REWARDS[lookupKey] ?? 0;
}

/**
 * Ensure the user has a unique VEK-XXXXXX referral code. Idempotent;
 * retries up to 5 times on collision (unique index is the arbiter).
 */
export async function ensureReferralCode(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<string> {
  const rows = await db.select().from(user).where(eq(user.id, userId));
  const existing = rows[0];
  if (!existing) throw new Error("User not found");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReference();
    try {
      await db
        .update(user)
        .set({ referralCode: code, updatedAt: new Date() })
        .where(and(eq(user.id, userId), sql`${user.referralCode} IS NULL`));
      // Read back to detect the rare race where another isolate won the code.
      const after = await db
        .select({ referralCode: user.referralCode })
        .from(user)
        .where(eq(user.id, userId));
      const assigned = after[0]?.referralCode;
      if (assigned) return assigned;
    } catch {
      // unique violation on referralCode — retry with a fresh code
    }
  }
  throw new Error("Could not generate a unique referral code");
}

export interface ReferrerPreview {
  referrer_first_name: string;
  referrer_company?: string | null;
  signup_bonus_credits: number;
}

/** Public lookup — only exposes first name + company, never email or id. */
export async function lookupReferrer(
  db: ReturnType<typeof createDb>,
  refCode: string,
): Promise<ReferrerPreview | null> {
  const normalized = (refCode || "").trim().toUpperCase();
  if (!normalized) return null;

  const referrerRows = await db.select().from(user).where(eq(user.referralCode, normalized));
  const referrer = referrerRows[0];
  if (!referrer) return null;

  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.userId, referrer.id))
    .orderBy(companies.createdAt);
  const company = companyRows[0];

  const rawName = (referrer.name || referrer.email.split("@")[0] || "").split(" ")[0] || "";
  return {
    referrer_first_name: rawName.trim() || "A Vektor user",
    referrer_company: company?.companyName ?? null,
    signup_bonus_credits: REFEREE_SIGNUP_BONUS,
  };
}

/**
 * Store the referral link at signup time. Returns the referrer's user id when
 * attribution succeeded; unknown codes, self-referrals and duplicate claims
 * are ignored (no error).
 */
export async function recordSignup(
  db: ReturnType<typeof createDb>,
  refereeUserId: string,
  refereeEmail: string,
  refCode: string,
): Promise<string | null> {
  const normalized = (refCode || "").trim().toUpperCase();
  if (!normalized) return null;

  const referrerRows = await db.select().from(user).where(eq(user.referralCode, normalized));
  const referrer = referrerRows[0];
  if (!referrer) return null;
  if (referrer.email.toLowerCase() === refereeEmail.toLowerCase()) return null;
  if (referrer.id === refereeUserId) return null;

  // First code wins — only attribute if the referee has no referrer yet.
  const claimed = await db
    .update(user)
    .set({
      referredByUserId: referrer.id,
      referredByCode: normalized,
      referredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(user.id, refereeUserId), sql`${user.referredByUserId} IS NULL`))
    .returning({ id: user.id });
  if (claimed.length === 0) return null;

  try {
    await db.insert(referrals).values({
      id: crypto.randomUUID(),
      referrerUserId: referrer.id,
      refereeUserId,
      refereeEmail: refereeEmail.toLowerCase(),
      code: normalized,
      status: "signed_up",
      createdAt: new Date(),
    });
  } catch {
    // Concurrent claim won the referrals unique row — treat as already attributed.
    return null;
  }
  return referrer.id;
}

async function rewardsUsedThisMonth(
  db: ReturnType<typeof createDb>,
  referrerId: string,
): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(referralRewards)
    .where(
      and(
        eq(referralRewards.referrerUserId, referrerId),
        gte(referralRewards.createdAt, monthStart),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

async function rewardsUsedLifetime(
  db: ReturnType<typeof createDb>,
  referrerId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(referralRewards)
    .where(eq(referralRewards.referrerUserId, referrerId));
  return Number(rows[0]?.count ?? 0);
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
 * Called from the EFT admin confirm handler on every successful confirmation.
 * Fires only on the referee's FIRST paid subscription EFT; PAYG never rewards.
 * Idempotent, respects monthly + lifetime caps.
 */
export async function maybeRewardReferrerOnPaidEft(
  db: ReturnType<typeof createDb>,
  args: {
    refereeUserId: string;
    isSubscription: boolean;
    triggerReference: string;
    planLookupKey?: string | null;
  },
): Promise<RewardResult | null> {
  const { refereeUserId, isSubscription, triggerReference, planLookupKey } = args;

  const refRows = await db
    .select()
    .from(referrals)
    .where(eq(referrals.refereeUserId, refereeUserId));
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
  if (monthly >= MONTHLY_REWARD_CAP) {
    await db
      .update(referrals)
      .set({ status: "capped", cappedAt: new Date(), capReason: "monthly" })
      .where(eq(referrals.id, ref.id));
    return { granted: false, reason: "monthly_cap" };
  }
  const lifetime = await rewardsUsedLifetime(db, referrerId);
  if (lifetime >= LIFETIME_REWARD_CAP) {
    await db
      .update(referrals)
      .set({ status: "capped", cappedAt: new Date(), capReason: "lifetime" })
      .where(eq(referrals.id, ref.id));
    return { granted: false, reason: "lifetime_cap" };
  }

  // Referrer's primary company = first one they created.
  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.userId, referrerId))
    .orderBy(companies.createdAt);
  const referrerCompany = companyRows[0];

  if (!referrerCompany) {
    await db
      .update(referrals)
      .set({
        status: "pending_referrer_company",
        pendingReferrerCredits: creditsToGrant,
        pendingPlanLookupKey: planLookupKey ?? null,
      })
      .where(eq(referrals.id, ref.id));
    return { granted: false, reason: "referrer_has_no_company" };
  }

  const now = new Date();
  await db
    .insert(companyCredits)
    .values({ companyId: referrerCompany.id, credits: creditsToGrant, updatedAt: now })
    .onConflictDoUpdate({
      target: companyCredits.companyId,
      set: { credits: sql`${companyCredits.credits} + ${creditsToGrant}`, updatedAt: now },
    });

  await db.insert(referralRewards).values({
    id: crypto.randomUUID(),
    referrerUserId: referrerId,
    refereeUserId,
    referrerCompanyId: referrerCompany.id,
    creditsGranted: creditsToGrant,
    type: "first_paid_subscription",
    planLookupKey: planLookupKey ?? null,
    triggerReference,
    createdAt: now,
  });

  // Idempotency flag flipped atomically — a concurrent second confirm no-ops here.
  await db
    .update(referrals)
    .set({
      status: "first_paid_subscription",
      referrerFirstPaidBonusGranted: true,
      referrerSubBonusGranted: true,
      firstPaidAt: now,
      firstPaidPlanLookupKey: planLookupKey ?? null,
    })
    .where(and(eq(referrals.id, ref.id), eq(referrals.referrerFirstPaidBonusGranted, false)));

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

/** Dashboard stats for a user's referral tab. */
export async function myStats(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<ReferralStats> {
  const code = await ensureReferralCode(db, userId);

  const invitedRows = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId))
    .orderBy(sql`${referrals.createdAt} DESC`);
  const paid = invitedRows.filter((r) => r.referrerFirstPaidBonusGranted).length;
  const subscribed = invitedRows.filter((r) => r.referrerSubBonusGranted).length;

  const creditsEarned =
    (
      await db
        .select({ total: sql<number>`coalesce(sum(${referralRewards.creditsGranted}), 0)` })
        .from(referralRewards)
        .where(eq(referralRewards.referrerUserId, userId))
    )[0]?.total ?? 0;

  const monthlyUsed = await rewardsUsedThisMonth(db, userId);
  const lifetimeUsed = await rewardsUsedLifetime(db, userId);

  // Redact referee emails so referrers can identify their invite but not spam it.
  const recent = invitedRows.slice(0, 10).map((r) => {
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
    invited_count: invitedRows.length,
    paid_count: paid,
    subscribed_count: subscribed,
    credits_earned: Number(creditsEarned),
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
