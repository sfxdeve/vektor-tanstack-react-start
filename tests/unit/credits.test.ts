import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { user } from "@/db/schema/auth";
import { consumeCredit, ensureCredits, getCredits, refundCredit, setCredits } from "@/lib/credits";

import type { Database } from "@/db";

import { createTestDb } from "../helpers/test-db";

async function seedCompany(db: Database, id = "co-1"): Promise<string> {
  const now = new Date();
  await db.insert(user).values({
    id: "u-1",
    name: "Owner",
    email: `${id}@example.com`,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(companies).values({
    id,
    userId: "u-1",
    companyName: "Test Co",
    cipcNum: "2021/123456/07",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe("credits — consume/refund against real SQL", () => {
  it("getCredits returns 0 when the company has no ledger row", async () => {
    const db = createTestDb();
    await seedCompany(db);
    expect(await getCredits(db, "co-1")).toBe(0);
  });

  it("consumeCredit spends a credit and returns true", async () => {
    const db = createTestDb();
    await seedCompany(db);
    await setCredits(db, "co-1", 5);

    expect(await consumeCredit(db, "co-1")).toBe(true);
    expect(await getCredits(db, "co-1")).toBe(4);
  });

  it("consumeCredit returns false when balance is zero and never goes negative", async () => {
    const db = createTestDb();
    await seedCompany(db);
    await setCredits(db, "co-1", 0);

    expect(await consumeCredit(db, "co-1")).toBe(false);
    expect(await getCredits(db, "co-1")).toBe(0);
  });

  it("consumeCredit returns false when no ledger row exists at all", async () => {
    const db = createTestDb();
    await seedCompany(db);

    expect(await consumeCredit(db, "co-1")).toBe(false);
    expect(await getCredits(db, "co-1")).toBe(0);
  });

  it("refundCredit adds a credit back after a failed analysis", async () => {
    const db = createTestDb();
    await seedCompany(db);
    await setCredits(db, "co-1", 2);

    await consumeCredit(db, "co-1");
    await refundCredit(db, "co-1");
    expect(await getCredits(db, "co-1")).toBe(2);
  });

  it("ensureCredits seeds once and is idempotent (trial grant)", async () => {
    const db = createTestDb();
    const companyId = await seedCompany(db);

    await ensureCredits(db, companyId, 1);
    await ensureCredits(db, companyId, 1);
    expect(await getCredits(db, companyId)).toBe(1);
  });

  it("ledger rows cascade away with their company", async () => {
    const db = createTestDb();
    await seedCompany(db);
    await setCredits(db, "co-1", 3);

    await db.delete(companies).where(eq(companies.id, "co-1"));
    const rows = await db.select().from(companyCredits);
    expect(rows).toHaveLength(0);
  });
});
