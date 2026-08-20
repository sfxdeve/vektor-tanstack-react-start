import { describe, expect, it } from "vitest";

import { VALID_COUNCIL_CODES } from "@/lib/bargaining-councils";
import {
  DOC_TYPES,
  REMINDER_THRESHOLDS,
  VALID_DOC_TYPES,
  extractBbbeeLevelFromText,
  extractExpiryFromText,
  isBargainingCouncilCovered,
  isExpiryMismatch,
  validateBargainingCouncil,
} from "@/lib/compliance";

describe("compliance — doc types", () => {
  it("has 5 doc types and VALID_DOC_TYPES contains them", () => {
    expect(DOC_TYPES).toHaveLength(5);
    expect(VALID_DOC_TYPES.has("TAX_PIN")).toBe(true);
    expect(VALID_DOC_TYPES.has("COIDA")).toBe(true);
    expect(VALID_DOC_TYPES.has("BBBEE")).toBe(true);
    expect(VALID_DOC_TYPES.has("BARGAINING_COUNCIL_GOS")).toBe(true);
    expect(VALID_DOC_TYPES.has("DIRECTOR_ID")).toBe(true);
    expect(VALID_DOC_TYPES.has("UNKNOWN")).toBe(false);
  });

  it("validateBargainingCouncil requires code for BC docs", () => {
    expect(() => validateBargainingCouncil("BARGAINING_COUNCIL_GOS", null)).toThrow(/required/);
    expect(() => validateBargainingCouncil("BARGAINING_COUNCIL_GOS", "")).toThrow(/required/);
    expect(() => validateBargainingCouncil("BARGAINING_COUNCIL_GOS", "ZZZ")).toThrow(/Unknown/);
    expect(validateBargainingCouncil("BARGAINING_COUNCIL_GOS", "BCCEI")).toBe("BCCEI");
    expect(validateBargainingCouncil("BARGAINING_COUNCIL_GOS", "NBCEI")).toBe("NBCEI");
  });

  it("validateBargainingCouncil ignores council for non-BC docs", () => {
    expect(validateBargainingCouncil("TAX_PIN", "BCCEI")).toBeNull();
    expect(validateBargainingCouncil("BBBEE", null)).toBeNull();
    expect(validateBargainingCouncil("COIDA", "ZZZ")).toBeNull();
  });

  it("VALID_COUNCIL_CODES contains known codes", () => {
    expect(VALID_COUNCIL_CODES.has("BCCEI")).toBe(true);
    expect(VALID_COUNCIL_CODES.has("NBCEI")).toBe(true);
    expect(VALID_COUNCIL_CODES.has("MEIBC")).toBe(true);
  });
});

describe("compliance — B-BBEE level extraction", () => {
  it("extracts Level 3 from B-BBEE phrasings", () => {
    expect(extractBbbeeLevelFromText("B-BBEE Status Level 3")).toBe(3);
    expect(extractBbbeeLevelFromText("BEE Level: 2")).toBe(2);
    expect(extractBbbeeLevelFromText("Level of Contribution: 4")).toBe(4);
    expect(extractBbbeeLevelFromText("Level 5 Contributor")).toBe(5);
    expect(extractBbbeeLevelFromText("level 8")).toBe(8);
  });

  it("is case-insensitive", () => {
    expect(extractBbbeeLevelFromText("b-bbee level 1")).toBe(1);
    expect(extractBbbeeLevelFromText("B-BBEE LEVEL: 6")).toBe(6);
  });

  it("returns null when no level found", () => {
    expect(extractBbbeeLevelFromText("")).toBeNull();
    expect(extractBbbeeLevelFromText("No level here")).toBeNull();
    expect(extractBbbeeLevelFromText("Level 9 is out of range")).toBeNull();
  });

  it("prefers first specific match", () => {
    expect(extractBbbeeLevelFromText("B-BBEE Status Level 3 Contributor — Level 8 mention")).toBe(
      3,
    );
  });
});

describe("compliance — expiry extraction", () => {
  it("extracts expiry after anchor — ISO YYYY-MM-DD", () => {
    expect(extractExpiryFromText("Valid until 2027-01-15")).toBe("2027-01-15");
    expect(extractExpiryFromText("Expiry date: 2027/01/15")).toBe("2027-01-15");
    expect(extractExpiryFromText("Date of Expiry: 2027.01.15")).toBe("2027-01-15");
  });

  it("extracts DD/MM/YYYY SA format dayfirst", () => {
    expect(extractExpiryFromText("Valid until 15/01/2027")).toBe("2027-01-15");
    expect(extractExpiryFromText("Expires on 15-01-2027")).toBe("2027-01-15");
  });

  it("extracts 15 January 2027", () => {
    expect(extractExpiryFromText("Valid to 15 January 2027")).toBe("2027-01-15");
    expect(extractExpiryFromText("Certificate valid 15 Jan 2027")).toBe("2027-01-15");
  });

  it("extracts January 15, 2027", () => {
    expect(extractExpiryFromText("Valid until January 15, 2027")).toBe("2027-01-15");
    expect(extractExpiryFromText("Expiry date: Jan 15 2027")).toBe("2027-01-15");
  });

  it("requires anchor — does not grab issue date without anchor", () => {
    expect(extractExpiryFromText("Issue date: 15 January 2027")).toBeNull();
    expect(extractExpiryFromText("15 January 2027")).toBeNull();
  });

  it("returns null for unparseable or empty", () => {
    expect(extractExpiryFromText("")).toBeNull();
    expect(extractExpiryFromText("Valid until not-a-date")).toBeNull();
  });
});

describe("compliance — bargaining council coverage (legacy untagged handling)", () => {
  it("covers when tagged code matches applicable", () => {
    expect(
      isBargainingCouncilCovered(["BCCEI"], [{ bargainingCouncil: "BCCEI", isCompliant: true }]),
    ).toBe(true);
  });

  it("does not cover when tagged code mismatches", () => {
    expect(
      isBargainingCouncilCovered(["BCCEI"], [{ bargainingCouncil: "NBCEI", isCompliant: true }]),
    ).toBe(false);
  });

  it("legacy untagged compliant doc covers any applicable council", () => {
    expect(
      isBargainingCouncilCovered(["BCCEI"], [{ bargainingCouncil: null, isCompliant: true }]),
    ).toBe(true);
    expect(
      isBargainingCouncilCovered(["MEIBC"], [{ bargainingCouncil: null, isCompliant: true }]),
    ).toBe(true);
    // Even multiple applicable councils
    expect(
      isBargainingCouncilCovered(
        ["BIBC_WC", "BIBC_SEC"],
        [{ bargainingCouncil: null, isCompliant: true }],
      ),
    ).toBe(true);
  });

  it("untagged non-compliant does NOT cover", () => {
    expect(
      isBargainingCouncilCovered(["BCCEI"], [{ bargainingCouncil: null, isCompliant: false }]),
    ).toBe(false);
  });

  it("non-compliant tagged does not cover even if code matches", () => {
    expect(
      isBargainingCouncilCovered(["BCCEI"], [{ bargainingCouncil: "BCCEI", isCompliant: false }]),
    ).toBe(false);
  });

  it("mixed docs: one compliant untagged covers despite other non-compliant", () => {
    expect(
      isBargainingCouncilCovered(
        ["BCCEI"],
        [
          { bargainingCouncil: "NBCEI", isCompliant: true },
          { bargainingCouncil: null, isCompliant: true },
        ],
      ),
    ).toBe(true);
  });

  it("no docs means not covered", () => {
    expect(isBargainingCouncilCovered(["BCCEI"], [])).toBe(false);
  });

  it("multiple applicable councils — any match suffices", () => {
    expect(
      isBargainingCouncilCovered(
        ["BIBC_WC", "BIBC_SEC", "BIBC_EL"],
        [{ bargainingCouncil: "BIBC_SEC", isCompliant: true }],
      ),
    ).toBe(true);
    expect(
      isBargainingCouncilCovered(
        ["BIBC_WC", "BIBC_SEC"],
        [{ bargainingCouncil: "BIBC_KIM", isCompliant: true }],
      ),
    ).toBe(false);
  });
});

describe("compliance — expiry mismatch", () => {
  it("detects mismatch when typed and extracted differ", () => {
    expect(isExpiryMismatch("2027-01-15", "2027-01-16")).toBe(true);
    expect(isExpiryMismatch("2027-01-15", "2027-02-15")).toBe(true);
  });

  it("no mismatch when equal", () => {
    expect(isExpiryMismatch("2027-01-15", "2027-01-15")).toBe(false);
    expect(isExpiryMismatch("2027-01-15T00:00:00.000Z", "2027-01-15")).toBe(false);
  });

  it("no mismatch when either missing", () => {
    expect(isExpiryMismatch(null, "2027-01-15")).toBe(false);
    expect(isExpiryMismatch("2027-01-15", null)).toBe(false);
    expect(isExpiryMismatch(undefined, undefined)).toBe(false);
  });
});

describe("compliance — reminder thresholds idempotency preparation", () => {
  it("has 30/7/0 thresholds", () => {
    expect([...REMINDER_THRESHOLDS]).toEqual([30, 7, 0]);
  });

  it("each (company, document, threshold) should be unique for idempotency - thresholds are distinct", () => {
    const set = new Set(REMINDER_THRESHOLDS);
    expect(set.size).toBe(3);
    expect(set.has(30)).toBe(true);
    expect(set.has(7)).toBe(true);
    expect(set.has(0)).toBe(true);
  });
});
