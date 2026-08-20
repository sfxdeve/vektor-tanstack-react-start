import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { companies } from "./company";

export const referrals = sqliteTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refereeEmail: text("referee_email").notNull(),
    code: text("code").notNull(),
    status: text("status").notNull().default("signed_up"),
    signupBonusGranted: integer("signup_bonus_granted", { mode: "boolean" })
      .notNull()
      .default(false),
    referrerFirstPaidBonusGranted: integer("referrer_first_paid_bonus_granted", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    referrerSubBonusGranted: integer("referrer_sub_bonus_granted", { mode: "boolean" })
      .notNull()
      .default(false),
    cappedAt: integer("capped_at", { mode: "timestamp" }),
    capReason: text("cap_reason"),
    pendingReferrerCredits: integer("pending_referrer_credits"),
    pendingPlanLookupKey: text("pending_plan_lookup_key"),
    firstPaidAt: integer("first_paid_at", { mode: "timestamp" }),
    firstPaidPlanLookupKey: text("first_paid_plan_lookup_key"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("referrals_referrer_idx").on(t.referrerUserId),
    uniqueIndex("referrals_referee_unique").on(t.refereeUserId),
    index("referrals_code_idx").on(t.code),
  ],
);

export type ReferralRow = typeof referrals.$inferSelect;
export type ReferralInsert = typeof referrals.$inferInsert;

export const referralRewards = sqliteTable(
  "referral_rewards",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referrerCompanyId: text("referrer_company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    creditsGranted: integer("credits_granted").notNull(),
    type: text("type").notNull().default("first_paid_subscription"),
    planLookupKey: text("plan_lookup_key"),
    triggerReference: text("trigger_reference"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("referral_rewards_referrer_idx").on(t.referrerUserId),
    index("referral_rewards_created_at_idx").on(t.createdAt),
  ],
);

export type ReferralRewardRow = typeof referralRewards.$inferSelect;
export type ReferralRewardInsert = typeof referralRewards.$inferInsert;
