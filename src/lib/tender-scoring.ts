/**
 * Tender scoring domain — ported verbatim from backend/routes/tender_routes.py
 * Risk flags and fit score logic.
 */

import { cidbMeetsRequirement, parseCidbGrade } from "./cidb";
import { councilsForCidbClass } from "./bargaining-councils";
import { isBargainingCouncilCovered } from "./compliance";
import { calculateBbbeePoints, verdictFromScore } from "./bbbee";

export interface ComplianceDoc {
  docType: string;
  isCompliant: boolean;
  bargainingCouncil: string | null;
  expiryDate?: string | Date | null;
}

export interface CompanyForScoring {
  bbbeeLevel: number | null | undefined;
  cidbCrsNum: string | null | undefined;
  bargainingCouncils: string[] | null | undefined;
}

export interface AiResult {
  tender_title: string;
  tender_number: string | null;
  issuing_entity: string | null;
  required_cidb: string | null;
  closing_date: string | null;
  mandatory_returnables: string[];
}

export interface ScoringResult {
  fitScore: number;
  riskFlags: string[];
  verdict: string;
  eligibleBbbeePoints: number;
}

export function scoreTender(
  aiResult: AiResult,
  company: CompanyForScoring,
  complianceDocs: ComplianceDoc[],
  preferenceSystem: string,
  now: Date = new Date(),
): ScoringResult {
  let fitScore = 100;
  const riskFlags: string[] = [];

  // Tax compliance
  const taxDocs = complianceDocs.filter((d) => d.docType === "TAX_PIN");
  if (taxDocs.length === 0 || !taxDocs.every((d) => d.isCompliant)) {
    riskFlags.push(
      "CRITICAL: SARS TCS Pin is non-compliant or missing. Immediate disqualification risk.",
    );
    fitScore -= 50;
  }

  // COIDA
  const coidaDocs = complianceDocs.filter((d) => d.docType === "COIDA");
  if (coidaDocs.length === 0 || !coidaDocs.every((d) => d.isCompliant)) {
    riskFlags.push("CRITICAL: COIDA Letter of Good Standing is expired or missing.");
    fitScore -= 30;
  }

  // CIDB grade check — higher grades cover lower within same class
  const reqCidb = aiResult.required_cidb ?? null;
  const companyCidb = company.cidbCrsNum ?? null;
  const [meets, reason] = cidbMeetsRequirement(reqCidb, companyCidb);
  if (!meets && reason) {
    riskFlags.push(reason);
    fitScore -= 20;
  }

  // Bargaining council check
  const reqClassParsed = reqCidb ? parseCidbGrade(reqCidb) : null;
  const reqClass = reqClassParsed ? reqClassParsed[1] : null;
  if (reqClass) {
    const applicableCouncils = councilsForCidbClass(reqClass);
    if (applicableCouncils.length > 0) {
      const applicableCodes = applicableCouncils.map((c) => c.code);
      const bcDocs = complianceDocs.filter((d) => d.docType === "BARGAINING_COUNCIL_GOS");
      // Use expiry-aware coverage helper (legacy untagged covers any)
      const bcCovered = isBargainingCouncilCovered(
        applicableCodes,
        bcDocs.map((d) => ({
          bargainingCouncil: d.bargainingCouncil,
          isCompliant: d.isCompliant,
          expiryDate: d.expiryDate ?? null,
        })),
        now,
      );

      if (!bcCovered) {
        const profileCodes = new Set(company.bargainingCouncils ?? []);
        const applicableSet = new Set(applicableCodes);
        const missingFromProfile = [...applicableSet].filter((c) => !profileCodes.has(c));
        let detail: string;
        if (applicableCouncils.length === 1) {
          detail = applicableCouncils[0]!.name;
        } else {
          detail = applicableCouncils.map((c) => c.code).join(" / ");
        }

        let msg: string;
        if (missingFromProfile.length === applicableCodes.length && profileCodes.size > 0) {
          msg =
            `WARNING: This tender falls under ${detail}, which is ` +
            `not on your registered councils list. Register with the ` +
            `applicable council and upload the Letter of Good Standing, ` +
            `or you risk disqualification.`;
        } else {
          msg =
            `WARNING: This tender falls under ${detail}. Upload a ` +
            `current Letter of Good Standing for the applicable council ` +
            `in your Compliance Vault, or risk disqualification.`;
        }
        riskFlags.push(msg);
        fitScore -= 15;
      }
    }
  }

  const eligibleBbbeePoints = calculateBbbeePoints(company.bbbeeLevel, preferenceSystem);
  const clamped = Math.max(0, Math.min(100, fitScore));
  const verdict = verdictFromScore(clamped);

  return {
    fitScore: clamped,
    riskFlags,
    verdict,
    eligibleBbbeePoints,
  };
}
