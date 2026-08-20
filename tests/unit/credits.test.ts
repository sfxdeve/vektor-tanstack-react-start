import { describe, expect, it } from "vitest";

import { consumeCredit, getCredits, refundCredit, setCredits } from "@/lib/credits";
import { createDb } from "@/db";

// Instead of mocking D1, test the pure consume/refund logic by using an in-memory implementation
// We exercise the actual functions with a stubbed Db that returns controllable results.

describe("credits — consume/refund edge cases", () => {
  it("getCredits returns 0 when no row", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as unknown as ReturnType<typeof createDb>;
    expect(await getCredits(fakeDb, "nonexistent")).toBe(0);
  });

  it("consumeCredit returns false when 0 credits", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ companyId: "c1", credits: 0, updatedAt: new Date() }],
        }),
      }),
    } as unknown as ReturnType<typeof createDb>;
    expect(await consumeCredit(fakeDb, "c1")).toBe(false);
  });

  it("consumeCredit succeeds when credits >0 and decrements", async () => {
    let updated: unknown = null;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ companyId: "c1", credits: 5, updatedAt: new Date() }],
        }),
      }),
      update: () => ({
        set: (v: unknown) => ({
          where: async () => {
            updated = v;
          },
        }),
      }),
    } as unknown as ReturnType<typeof createDb>;
    const ok = await consumeCredit(fakeDb, "c1");
    expect(ok).toBe(true);
    expect((updated as { credits: number }).credits).toBe(4);
  });

  it("refundCredit increments credits", async () => {
    let updated: unknown = null;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ companyId: "c1", credits: 2, updatedAt: new Date() }],
        }),
      }),
      update: () => ({
        set: (v: unknown) => ({
          where: async () => {
            updated = v;
          },
        }),
      }),
      insert: () => ({
        values: async () => {
          // not called when row exists
        },
      }),
    } as unknown as ReturnType<typeof createDb>;
    await refundCredit(fakeDb, "c1");
    expect((updated as { credits: number }).credits).toBe(3);
  });

  it("setCredits creates row when missing, updates when exists", async () => {
    // missing -> insert
    let inserted: unknown = null;
    const dbMissing = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      insert: () => ({
        values: async (v: unknown) => {
          inserted = v;
        },
      }),
    } as unknown as ReturnType<typeof createDb>;
    await setCredits(dbMissing, "c2", 10);
    expect((inserted as { credits: number }).credits).toBe(10);

    // exists -> update
    let updated: unknown = null;
    const dbExists = {
      select: () => ({
        from: () => ({
          where: async () => [{ companyId: "c2", credits: 10, updatedAt: new Date() }],
        }),
      }),
      update: () => ({
        set: (v: unknown) => ({
          where: async () => {
            updated = v;
          },
        }),
      }),
    } as unknown as ReturnType<typeof createDb>;
    await setCredits(dbExists, "c2", 7);
    expect((updated as { credits: number }).credits).toBe(7);
  });
});
