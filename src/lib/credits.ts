/**
 * Credit ledger — atomic consume/refund against D1.
 * Mirrors backend/billing_service.py consume_credit / refund_credit.
 */

import { eq, sql } from "drizzle-orm";

import type { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";

type Db = ReturnType<typeof createDb>;

export async function getCredits(db: Db, companyId: string): Promise<number> {
  const rows = await db
    .select({ credits: companyCredits.credits })
    .from(companyCredits)
    .where(eq(companyCredits.companyId, companyId));
  return rows[0]?.credits ?? 0;
}

/** Insert the row if absent (new companies start with their trial credit). */
export async function ensureCredits(db: Db, companyId: string, initial = 0): Promise<void> {
  await db
    .insert(companyCredits)
    .values({ companyId, credits: initial, updatedAt: new Date() })
    .onConflictDoNothing();
}

export async function setCredits(db: Db, companyId: string, credits: number): Promise<void> {
  await db
    .insert(companyCredits)
    .values({ companyId, credits, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: companyCredits.companyId,
      set: { credits, updatedAt: new Date() },
    });
}

/**
 * Atomically consumes one credit. The `credits > 0` guard lives inside the
 * UPDATE so concurrent requests can never drive the balance negative.
 * Returns false when the company has no credits to spend.
 */
export async function consumeCredit(db: Db, companyId: string): Promise<boolean> {
  const consumed = await db
    .update(companyCredits)
    .set({ credits: sql`${companyCredits.credits} - 1`, updatedAt: new Date() })
    .where(sql`${companyCredits.companyId} = ${companyId} AND ${companyCredits.credits} > 0`)
    .returning({ companyId: companyCredits.companyId });
  return consumed.length > 0;
}

/** Refunds one credit after a failed paid operation. */
export async function refundCredit(db: Db, companyId: string): Promise<void> {
  await db
    .update(companyCredits)
    .set({ credits: sql`${companyCredits.credits} + 1`, updatedAt: new Date() })
    .where(eq(companyCredits.companyId, companyId));
}
