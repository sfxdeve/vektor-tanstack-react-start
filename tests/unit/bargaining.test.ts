import { describe, expect, it } from "vitest";

import {
  COUNCILS,
  councilsForCidbClass,
  listCouncilsPublic,
  VALID_COUNCIL_CODES,
} from "@/lib/bargaining-councils";

describe("bargaining-councils", () => {
  it("has expected council count and codes", () => {
    expect(COUNCILS.length).toBeGreaterThanOrEqual(8);
    expect(VALID_COUNCIL_CODES.has("BCCEI")).toBe(true);
    expect(VALID_COUNCIL_CODES.has("NBCEI")).toBe(true);
    expect(VALID_COUNCIL_CODES.has("MEIBC")).toBe(true);
  });

  it("councilsForCidbClass returns BCCEI for CE", () => {
    const res = councilsForCidbClass("CE");
    expect(res.map((c) => c.code)).toContain("BCCEI");
    expect(res).toHaveLength(1);
  });

  it("returns NBCEI for EB and EP", () => {
    expect(councilsForCidbClass("EB").map((c) => c.code)).toContain("NBCEI");
    expect(councilsForCidbClass("EP").map((c) => c.code)).toContain("NBCEI");
  });

  it("returns MEIBC for ME", () => {
    expect(councilsForCidbClass("ME").map((c) => c.code)).toContain("MEIBC");
  });

  it("returns all 5 regional councils for GB", () => {
    const res = councilsForCidbClass("GB");
    expect(res.length).toBe(5);
    const codes = res.map((c) => c.code);
    expect(codes).toContain("BIBC_WC");
    expect(codes).toContain("BIBC_SEC");
  });

  it("is case-insensitive", () => {
    expect(councilsForCidbClass("ce").map((c) => c.code)).toContain("BCCEI");
    expect(councilsForCidbClass("gb").length).toBe(5);
  });

  it("returns empty for unknown or null class", () => {
    expect(councilsForCidbClass("XX")).toEqual([]);
    expect(councilsForCidbClass(null)).toEqual([]);
    expect(councilsForCidbClass(undefined)).toEqual([]);
  });

  it("listCouncilsPublic strips evidence but keeps core fields", () => {
    const list = listCouncilsPublic();
    expect(list.length).toBe(COUNCILS.length);
    for (const c of list) {
      expect("evidence" in c).toBe(false);
      expect(c.code).toBeDefined();
      expect(c.name).toBeDefined();
      expect(c.cidb_classes).toBeDefined();
    }
  });
});
