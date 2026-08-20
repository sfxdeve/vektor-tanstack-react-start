import { describe, expect, it } from "vitest";

import { CATALOG, entryByLookup, toPackageApi } from "@/lib/billing-catalog";

describe("billing-catalog — canonical packages", () => {
  it("has 4 entries: 3 subscriptions + 1 PAYG", () => {
    expect(CATALOG).toHaveLength(4);
    const subs = CATALOG.filter((c) => c.type === "subscription");
    const payg = CATALOG.filter((c) => c.type === "one_time");
    expect(subs).toHaveLength(3);
    expect(payg).toHaveLength(1);
  });

  it("Starter 5 / R399, Pro 20 / R1299 popular, Scale 50 / R2499, Single 1 / R149", () => {
    const starter = entryByLookup("tc_starter_monthly_v2");
    expect(starter).toMatchObject({
      credits: 5,
      amount_cents: 39900,
      type: "subscription",
      is_popular: false,
    });

    const pro = entryByLookup("tc_pro_monthly_v2");
    expect(pro).toMatchObject({ credits: 20, amount_cents: 129900, is_popular: true });

    const scale = entryByLookup("tc_scale_monthly_v2");
    expect(scale).toMatchObject({ credits: 50, amount_cents: 249900, is_popular: false });

    const payg = entryByLookup("tc_credits_1_v2");
    expect(payg).toMatchObject({ credits: 1, amount_cents: 14900, type: "one_time" });
  });

  it("all subscription entries have interval month and billing_period monthly", () => {
    for (const e of CATALOG.filter((c) => c.type === "subscription")) {
      expect(e.interval).toBe("month");
      expect(e.billing_period).toBe("monthly");
    }
    const payg = entryByLookup("tc_credits_1_v2")!;
    expect(payg.interval).toBeNull();
    expect(payg.billing_period).toBe("one_time");
  });

  it("all amounts are ZAR and currency zar in API shape", () => {
    for (const e of CATALOG) {
      const pkg = toPackageApi(e);
      expect(pkg.currency).toBe("zar");
      expect(pkg.amount).toBe(e.amount_cents / 100);
    }
  });

  it("per_analysis is calculated correctly", () => {
    const starter = toPackageApi(entryByLookup("tc_starter_monthly_v2")!);
    expect(starter.per_analysis).toBeCloseTo(79.8, 1); // 399/5
    const payg = toPackageApi(entryByLookup("tc_credits_1_v2")!);
    expect(payg.per_analysis).toBe(149);
  });

  it("entryByLookup returns undefined for unknown key", () => {
    expect(entryByLookup("unknown_key")).toBeUndefined();
  });

  it("no Stripe fields are present", () => {
    for (const e of CATALOG) {
      expect((e as unknown as Record<string, unknown>).stripe_price_id).toBeUndefined();
      expect(JSON.stringify(e).toLowerCase()).not.toContain("stripe");
    }
  });
});
