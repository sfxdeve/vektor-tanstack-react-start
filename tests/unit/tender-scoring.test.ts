import { describe, expect, it } from "vitest";

import { scoreTender } from "@/lib/tender-scoring";
import { calculateBbbeePoints } from "@/lib/bbbee";

describe("tender-scoring — domain rules", () => {
  const baseAi = {
    tender_title: "Municipal Electrical Tender",
    tender_number: "MUN/2024/INFRA-045",
    issuing_entity: "City of Tshwane",
    required_cidb: "4EB",
    closing_date: "2025-03-15",
    mandatory_returnables: ["SBD 4", "SBD 6.1"],
    evaluation_criteria: ["Price 80", "B-BBEE 20"],
  };

  const baseCompany = {
    bbbeeLevel: 1,
    cidbCrsNum: "6EB",
    bargainingCouncils: [] as string[],
  };

  it("starts at 100 and deducts Tax -50 when missing", () => {
    const result = scoreTender(baseAi, baseCompany, [], "80/20");
    expect(result.riskFlags.some((f) => f.includes("SARS TCS"))).toBe(true);
    // Tax -50, COIDA -30, bargaining WARNING only (no points) => 100-80=20 (CIDB covered with 6EB)
    expect(result.fitScore).toBe(20);
  });

  it("COIDA missing -30", () => {
    const docs = [{ docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null }];
    const result = scoreTender(baseAi, baseCompany, docs, "80/20");
    expect(result.riskFlags.some((f) => f.includes("COIDA"))).toBe(true);
    expect(result.fitScore).toBe(100 - 30); // Tax covered, COIDA -30, bargaining WARNING only, cidb covered
  });

  it("CIDB mismatch -20 when contractor grade too low", () => {
    const docs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const companyLow = { ...baseCompany, cidbCrsNum: "2EB" };
    const result = scoreTender(baseAi, companyLow, docs, "80/20");
    expect(result.riskFlags.some((f) => f.includes("CIDB"))).toBe(true);
    expect(result.fitScore).toBe(80); // 100 -20, others covered
  });

  it("higher CIDB covers lower within same class", () => {
    const docs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const result = scoreTender(baseAi, { ...baseCompany, cidbCrsNum: "6EB" }, docs, "80/20");
    expect(result.riskFlags.some((f) => f.includes("CIDB"))).toBe(false);
    expect(result.fitScore).toBe(100);
  });

  it("different class CIDB fails", () => {
    const docs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const result = scoreTender(baseAi, { ...baseCompany, cidbCrsNum: "6CE" }, docs, "80/20");
    expect(result.riskFlags.some((f) => f.includes("CIDB class"))).toBe(true);
    expect(result.fitScore).toBe(80);
  });

  it("bargaining council WARNING only (no points) when uncovered, legacy untagged covers", () => {
    const docsWithoutBc = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
    ];
    const resultUncovered = scoreTender(baseAi, baseCompany, docsWithoutBc, "80/20");
    expect(
      resultUncovered.riskFlags.some(
        (f) =>
          (f.includes("WARNING") && f.includes("Bargaining")) || f.includes("tender falls under"),
      ),
    ).toBe(true);
    expect(resultUncovered.fitScore).toBe(100); // WARNING only, no deduction

    // With tagged matching doc, no warning
    const docsTagged = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const resultCovered = scoreTender(baseAi, baseCompany, docsTagged, "80/20");
    expect(resultCovered.fitScore).toBe(100);

    // Legacy untagged covers any applicable
    const docsUntaggedLegacy = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: null },
    ];
    const resultLegacy = scoreTender(baseAi, baseCompany, docsUntaggedLegacy, "80/20");
    expect(resultLegacy.fitScore).toBe(100);
  });

  it("expired BC docs do not cover — still WARNING only", () => {
    const past = new Date(Date.now() - 86400000 * 10).toISOString();
    const docsExpired = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      {
        docType: "BARGAINING_COUNCIL_GOS",
        isCompliant: true,
        bargainingCouncil: "NBCEI",
        expiryDate: past,
      },
    ];
    const result = scoreTender(baseAi, baseCompany, docsExpired, "80/20");
    expect(result.riskFlags.some((f) => f.includes("WARNING"))).toBe(true);
    expect(result.fitScore).toBe(100); // WARNING only
  });

  it("B-BBEE points calculated per preference system", () => {
    const docs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const level1Company = { ...baseCompany, bbbeeLevel: 1 };
    expect(scoreTender(baseAi, level1Company, docs, "80/20").eligibleBbbeePoints).toBe(20);
    expect(scoreTender(baseAi, level1Company, docs, "90/10").eligibleBbbeePoints).toBe(10);
    expect(calculateBbbeePoints(4, "80/20")).toBe(12);
    expect(calculateBbbeePoints(4, "90/10")).toBe(5);
  });

  it("fitScore clamped 0-100 and verdict mapping", () => {
    const docsEmpty: Array<{
      docType: string;
      isCompliant: boolean;
      bargainingCouncil: string | null;
    }> = [];
    const result = scoreTender(baseAi, { ...baseCompany, cidbCrsNum: "1EB" }, docsEmpty, "80/20");
    // Tax -50, COIDA -30, CIDB -20 (1EB vs 4EB), Bargaining WARNING only => 100-100 = 0 => clamped 0
    expect(result.fitScore).toBe(0);
    expect(result.verdict).toBe("NO-GO");

    const docsFull = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const high = scoreTender(baseAi, { ...baseCompany, cidbCrsNum: "6EB" }, docsFull, "80/20");
    expect(high.fitScore).toBe(100);
    expect(high.verdict).toBe("GO");

    const midCompany = { ...baseCompany, cidbCrsNum: "6EB" };
    const midDocs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: false, bargainingCouncil: null }, // COIDA non-compliant => -30
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const mid = scoreTender(baseAi, midCompany, midDocs, "80/20");
    expect(mid.fitScore).toBe(70);
    expect(mid.verdict).toBe("CAUTION");
  });

  it("preserves evaluation_criteria throughAiResult without affecting scoring", () => {
    const docs = [
      { docType: "TAX_PIN", isCompliant: true, bargainingCouncil: null },
      { docType: "COIDA", isCompliant: true, bargainingCouncil: null },
      { docType: "BARGAINING_COUNCIL_GOS", isCompliant: true, bargainingCouncil: "NBCEI" },
    ];
    const result = scoreTender(baseAi, baseCompany, docs, "80/20");
    expect(result.fitScore).toBe(100);
    expect(baseAi.evaluation_criteria).toHaveLength(2);
  });
});
