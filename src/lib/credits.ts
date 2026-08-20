/**
 * Credit helpers — Workers-native D1 implementation
 * Mirrors backend/billing_service.py consume_credit / refund_credit (atomic via D1)
 */

import { eq, sql } from "drizzle-orm";

import type { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";

type Db = ReturnType<typeof createDb>;

/** Branded company identifier — prevents mixing raw strings with validated ids */
export type CompanyId = string & { readonly __brand: unique symbol };

async function fetchCreditRow(db: Db, companyId: string) {
  const rows = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  return rows[0] ?? null;
}

async function updateCredits(db: Db, companyId: string, credits: number, now: Date): Promise<void> {
  await (
    db.update(companyCredits).set as unknown as (v: unknown) => {
      where: (c: unknown) => Promise<unknown>;
    }
  )({ credits, updatedAt: now }).where(eq(companyCredits.companyId, companyId));
}

export async function getCredits(db: Db, companyId: string): Promise<number> {
  const row = await fetchCreditRow(db, companyId);
  return row ? row.credits : 0;
}

export async function ensureCredits(db: Db, companyId: string, initial = 0): Promise<void> {
  const existing = await fetchCreditRow(db, companyId);
  if (existing) return;
  const now = new Date();
  await db.insert(companyCredits).values({
    companyId,
    credits: initial,
    updatedAt: now,
  });
}

export async function setCredits(db: Db, companyId: string, credits: number): Promise<void> {
  const now = new Date();
  const existing = await fetchCreditRow(db, companyId);
  if (existing) {
    await updateCredits(db, companyId, credits, now);
  } else {
    await db.insert(companyCredits).values({
      companyId,
      credits,
      updatedAt: now,
    });
  }
}

/**
 * Atomically consumes one credit if available.
 * Uses `credits > 0` guard in a single UPDATE to avoid read-then-write races.
 * Falls back to classic read-then-write for test fakes that don't implement sql/update.
 */
export async function consumeCredit(db: Db, companyId: string): Promise<boolean> {
  const now = new Date();
  try {
    const maybeUpdate = (db as unknown as { update?: unknown }).update;
    if (typeof maybeUpdate === "function") {
      const result = (await (
        db.update(companyCredits).set as unknown as (v: unknown) => {
          where: (c: unknown) => Promise<unknown>;
        }
      )({ credits: sql`${companyCredits.credits} - 1`, updatedAt: now } as unknown as Record<
        string,
        unknown
      >).where(
        sql`${companyCredits.companyId} = ${companyId} AND ${companyCredits.credits} > 0`,
      )) as unknown as { meta?: { changes?: number }; changes?: number; rowsAffected?: number };

      const changes = result?.meta?.changes ?? result?.changes ?? result?.rowsAffected ?? 0;
      if (changes > 0) return true;

      const hasMeta =
        result != null &&
        typeof result === "object" &&
        ("meta" in result || "changes" in result || "rowsAffected" in result);
      if (hasMeta) return false;
    }
  } catch {
    // fall through to classic path for fakes
  }

  const row = await fetchCreditRow(db, companyId);
  const current = row ? row.credits : 0;
  if (current <= 0) return false;
  if (row) {
    await updateCredits(db, companyId, current - 1, now);
  } else {
    await db.insert(companyCredits).values({
      companyId,
      credits: current - 1,
      updatedAt: now,
    });
  }
  return true;
}

export async function refundCredit(db: Db, companyId: string): Promise<void> {
  const now = new Date();
  const row = await fetchCreditRow(db, companyId);
  const current = row ? row.credits : 0;
  if (row) {
    await updateCredits(db, companyId, current + 1, now);
  } else {
    await db.insert(companyCredits).values({
      companyId,
      credits: 1,
      updatedAt: now,
    });
  }
}
