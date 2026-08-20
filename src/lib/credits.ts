/**
 * Credit helpers — Workers-native D1 implementation
 * Mirrors backend/billing_service.py consume_credit / refund_credit
 */

import { eq } from "drizzle-orm";

import type { createDb } from "@/db";
import { companyCredits } from "@/db/schema/credits";

type Db = ReturnType<typeof createDb>;

export async function getCredits(db: Db, companyId: string): Promise<number> {
  const rows = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  const row = rows[0];
  return row ? row.credits : 0;
}

export async function ensureCredits(db: Db, companyId: string, initial = 0): Promise<void> {
  const existing = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  if (existing[0]) return;
  const now = new Date();
  await db.insert(companyCredits).values({
    companyId,
    credits: initial,
    updatedAt: now,
  });
}

export async function setCredits(db: Db, companyId: string, credits: number): Promise<void> {
  const now = new Date();
  const existing = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  if (existing[0]) {
    await (
      db.update(companyCredits).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({ credits, updatedAt: now }).where(eq(companyCredits.companyId, companyId));
  } else {
    await db.insert(companyCredits).values({
      companyId,
      credits,
      updatedAt: now,
    });
  }
}

export async function consumeCredit(db: Db, companyId: string): Promise<boolean> {
  const rows = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  const row = rows[0];
  const current = row ? row.credits : 0;
  if (current <= 0) return false;
  const now = new Date();
  if (row) {
    await (
      db.update(companyCredits).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({ credits: current - 1, updatedAt: now }).where(eq(companyCredits.companyId, companyId));
  } else {
    // no row but somehow had credits >0 ? shouldn't happen
    await db.insert(companyCredits).values({
      companyId,
      credits: current - 1,
      updatedAt: now,
    });
  }
  return true;
}

export async function refundCredit(db: Db, companyId: string): Promise<void> {
  const rows = await (
    db.select().from(companyCredits).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companyCredits.$inferSelect)[]>
  )(eq(companyCredits.companyId, companyId));
  const row = rows[0];
  const current = row ? row.credits : 0;
  const now = new Date();
  if (row) {
    await (
      db.update(companyCredits).set as unknown as (v: unknown) => {
        where: (c: unknown) => Promise<unknown>;
      }
    )({ credits: current + 1, updatedAt: now }).where(eq(companyCredits.companyId, companyId));
  } else {
    await db.insert(companyCredits).values({
      companyId,
      credits: 1,
      updatedAt: now,
    });
  }
}
