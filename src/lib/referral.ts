/**
 * Referral hook stub — will be implemented in issue 07.
 * Issue 06 only needs idempotent EFT confirm to grant credits; referral reward is best-effort.
 * This stub allows EFT confirm to import without failing.
 */
import type { createDb } from "@/db";

type Db = ReturnType<typeof createDb>;

export async function maybeRewardReferrerOnPaidEft(
  _db: Db,
  _args: {
    refereeUserId: string;
    isSubscription: boolean;
    triggerReference: string;
    planLookupKey: string;
  },
): Promise<null> {
  // No-op until 07 implements referrals tables
  return null;
}
