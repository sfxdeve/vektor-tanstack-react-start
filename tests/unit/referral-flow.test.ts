import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import {
  ensureReferralCode,
  lookupReferrer,
  maybeRewardReferrerOnPaidEft,
  recordSignup,
  rewardForPlan,
} from "@/lib/referral";

import type { Database } from "@/db";

import { createTestDb } from "../helpers/test-db";

const NOW = new Date();

async function seedUser(db: Database, id: string, email: string): Promise<void> {
  await db.insert(user).values({ id, name: id, email, createdAt: NOW, updatedAt: NOW });
  // A code per user (mirrors the auth after-hook).
  await ensureReferralCode(db, id);
}

async function seedCompany(db: Database, id: string, ownerId: string): Promise<void> {
  await db.insert(companies).values({
    id,
    userId: ownerId,
    companyName: `${id} Pty Ltd`,
    cipcNum: "2021/123456/07",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe("referral — signup attribution guardrails", () => {
  it("attributes a valid referral and writes the audit row", async () => {
    const db = createTestDb();
    await seedUser(db, "referrer", "ref@example.com");
    await seedUser(db, "referee", "referee@example.com");

    const referrer = await db.select().from(user).where(eq(user.id, "referrer"));
    const code = referrer[0]!.referralCode!;

    const result = await recordSignup(db, "referee", "referee@example.com", code);
    expect(result).toBe("referrer");

    const referee = await db.select().from(user).where(eq(user.id, "referee"));
    expect(referee[0]!.referredByUserId).toBe("referrer");
  });

  it("blocks self-referral (same email)", async () => {
    const db = createTestDb();
    await seedUser(db, "solo", "solo@example.com");
    const row = await db.select().from(user).where(eq(user.id, "solo"));
    const result = await recordSignup(db, "solo", "solo@example.com", row[0]!.referralCode!);
    expect(result).toBeNull();
  });

  it("ignores unknown codes and empty codes", async () => {
    const db = createTestDb();
    await seedUser(db, "u1", "u1@example.com");
    expect(await recordSignup(db, "u1", "u1@example.com", "VEK-ZZZZZZ")).toBeNull();
    expect(await recordSignup(db, "u1", "u1@example.com", "")).toBeNull();
  });

  it("first code wins — a second referrer claim is ignored", async () => {
    const db = createTestDb();
    await seedUser(db, "first", "first@example.com");
    await seedUser(db, "second", "second@example.com");
    await seedUser(db, "referee", "referee@example.com");

    const first = (await db.select().from(user).where(eq(user.id, "first")))[0]!;
    const second = (await db.select().from(user).where(eq(user.id, "second")))[0]!;

    expect(await recordSignup(db, "referee", "referee@example.com", first.referralCode!)).toBe(
      "first",
    );
    expect(
      await recordSignup(db, "referee", "referee@example.com", second.referralCode!),
    ).toBeNull();
  });
});

describe("referral — lookup exposes name/company only", () => {
  it("returns first name + company, never email or user id", async () => {
    const db = createTestDb();
    await seedUser(db, "sharer", "sharer@example.com");
    await db.update(user).set({ name: "Rafeeq Fredericks" }).where(eq(user.id, "sharer"));
    await seedCompany(db, "co-sharer", "sharer");

    const row = (await db.select().from(user).where(eq(user.id, "sharer")))[0]!;
    const preview = await lookupReferrer(db, row.referralCode!);
    expect(preview?.referrer_first_name).toBe("Rafeeq");
    expect(preview?.referrer_company).toBe("co-sharer Pty Ltd");
    expect(JSON.stringify(preview)).not.toContain("@");
  });
});

describe("referral — reward on first paid subscription EFT", () => {
  it("grants tier credits to the referrer's primary company exactly once", async () => {
    const db = createTestDb();
    await seedUser(db, "referrer", "referrer@example.com");
    await seedUser(db, "referee", "referee@example.com");
    await seedCompany(db, "co-ref", "referrer");
    const code = (await db.select().from(user).where(eq(user.id, "referrer")))[0]!.referralCode!;
    await recordSignup(db, "referee", "referee@example.com", code);

    const args = {
      refereeUserId: "referee",
      isSubscription: true,
      triggerReference: "VEK-ABC234",
      planLookupKey: "tc_pro_monthly_v2",
    };
    const first = await maybeRewardReferrerOnPaidEft(db, args);
    expect(first).toMatchObject({ granted: true, credits: 5 });

    // Idempotent — a second confirm does not double-grant.
    const again = await maybeRewardReferrerOnPaidEft(db, args);
    expect(again).toBeNull();
  });

  it("never rewards PAYG purchases", async () => {
    const db = createTestDb();
    await seedUser(db, "r2", "r2@example.com");
    await seedUser(db, "e2", "e2@example.com");
    await seedCompany(db, "co-r2", "r2");
    const code = (await db.select().from(user).where(eq(user.id, "r2")))[0]!.referralCode!;
    await recordSignup(db, "e2", "e2@example.com", code);

    const result = await maybeRewardReferrerOnPaidEft(db, {
      refereeUserId: "e2",
      isSubscription: false,
      triggerReference: "VEK-XYZ789",
      planLookupKey: "tc_credits_1_v2",
    });
    expect(result).toEqual({ granted: false, reason: "not_subscription" });
  });

  it("rewardForPlan maps tiers and zeroes everything else", () => {
    expect(rewardForPlan("tc_starter_monthly_v2")).toBe(3);
    expect(rewardForPlan("tc_scale_monthly_v2")).toBe(10);
    expect(rewardForPlan("tc_credits_1_v2")).toBe(0);
    expect(rewardForPlan(null)).toBe(0);
  });
});
