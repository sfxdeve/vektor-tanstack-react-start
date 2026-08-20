/**
 * Compliance document domain logic — ported verbatim from
 * backend/routes/document_routes.py + tender bargain council coverage.
 */

import { VALID_COUNCIL_CODES } from "./bargaining-councils";

export const DOC_TYPES = [
  "TAX_PIN",
  "COIDA",
  "BBBEE",
  "BARGAINING_COUNCIL_GOS",
  "DIRECTOR_ID",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const VALID_DOC_TYPES = new Set<string>(DOC_TYPES);

export const DOC_TYPE_LABEL: Record<string, string> = {
  TAX_PIN: "Tax Clearance PIN",
  COIDA: "COIDA Letter of Good Standing",
  BBBEE: "B-BBEE Certificate",
  BARGAINING_COUNCIL_GOS: "Bargaining Council Letter of Good Standing",
  DIRECTOR_ID: "Director ID Copy",
};

const BBBEE_LEVEL_PATTERNS: RegExp[] = [
  /(?:B[-\s]?BBEE|BEE)\s*(?:status\s*)?level[:\s]*([1-8])\b/i,
  /level\s*(?:of\s*)?(?:contribut(?:ion|or))[:\s]*([1-8])\b/i,
  /\blevel\s*([1-8])\s*contribut(?:ion|or)\b/i,
  /\blevel\s*([1-8])\b/i,
];

const EXPIRY_ANCHORS = [
  "valid\\s*(?:until|to|till|through)",
  "date\\s*of\\s*expiry",
  "expiry\\s*date",
  "expires?\\s*(?:on)?",
  "certificate\\s*(?:valid|expiry)",
  "validity\\s*(?:period)?\\s*(?:end|expires?)?",
];

const DATE_CANDIDATE =
  "(" +
  "\\d{4}[-/. ]\\d{1,2}[-/. ]\\d{1,2}" + // 2027-01-15
  "|\\d{1,2}[-/. ]\\d{1,2}[-/. ]\\d{4}" + // 15/01/2027
  "|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}" + // 15 January 2027
  "|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}" + // January 15 2027
  ")";

const EXPIRY_LINE_RE = new RegExp(
  `(?:${EXPIRY_ANCHORS.join("|")})[:\\s\\-]*${DATE_CANDIDATE}`,
  "gi",
);

export function extractBbbeeLevelFromText(text: string): number | null {
  if (!text) return null;
  for (const pattern of BBBEE_LEVEL_PATTERNS) {
    // need fresh regex each time because /g not used but ensure lastIndex reset
    const re = new RegExp(pattern.source, pattern.flags);
    const m = re.exec(text);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n >= 1 && n <= 8) return n;
    }
  }
  return null;
}

function parseDateCandidate(candidate: string): string | null {
  const c = candidate.trim();
  // Try ISO  YYYY-MM-DD / YYYY/MM/DD
  const iso = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/;
  const dmy = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/;
  const dMonthY = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/;
  const monthD_Y = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  let m: RegExpExecArray | null;
  if ((m = iso.exec(c))) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else if ((m = dmy.exec(c))) {
    // SA dayfirst: DD/MM/YYYY
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  } else if ((m = dMonthY.exec(c))) {
    day = Number(m[1]);
    month = monthNameToNumber(m[2] ?? "");
    year = Number(m[3]);
  } else if ((m = monthD_Y.exec(c))) {
    month = monthNameToNumber(m[1] ?? "");
    day = Number(m[2]);
    year = Number(m[3]);
  } else {
    return null;
  }

  if (year == null || month == null || day == null) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  // Use UTC to avoid TZ shift
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

function monthNameToNumber(name: string): number | null {
  const map: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return map[name.toLowerCase()] ?? null;
}

export function extractExpiryFromText(text: string): string | null {
  if (!text) return null;
  // Reset global regex
  EXPIRY_LINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXPIRY_LINE_RE.exec(text)) !== null) {
    const candidate = match[1];
    if (!candidate) continue;
    const iso = parseDateCandidate(candidate);
    if (iso) return iso;
  }
  return null;
}

export function extractBbbeeLevelFromBytes(bytes: Uint8Array): number | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return extractBbbeeLevelFromText(text);
  } catch {
    return null;
  }
}

export function extractExpiryFromBytes(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return extractExpiryFromText(text);
  } catch {
    return null;
  }
}

/**
 * Validate doc_type + bargainingCouncil combination.
 * Returns normalized bargainingCouncil or throws.
 */
export function validateBargainingCouncil(
  docType: string,
  bargainingCouncil: string | null | undefined,
): string | null {
  if (docType === "BARGAINING_COUNCIL_GOS") {
    if (!bargainingCouncil || String(bargainingCouncil).trim() === "") {
      throw new Error("bargaining_council code is required for Bargaining Council letters");
    }
    const code = String(bargainingCouncil).trim();
    if (!VALID_COUNCIL_CODES.has(code)) {
      throw new Error(`Unknown bargaining council code: ${code}`);
    }
    return code;
  }
  // For non-BC doc types, ignore any council value silently (legacy compat)
  return null;
}

/**
 * Bargaining council coverage: legacy untagged compliant docs cover any council.
 * Ported verbatim from backend/routes/tender_routes.py.
 */
export function isBargainingCouncilCovered(
  applicableCodes: string[],
  docs: Array<{ bargainingCouncil: string | null; isCompliant: boolean }>,
): boolean {
  const bcDocs = docs.filter((d) => d.isCompliant);
  if (bcDocs.length === 0) return false;
  const tagged = new Set(
    bcDocs.filter((d) => d.bargainingCouncil).map((d) => d.bargainingCouncil as string),
  );
  const hasUntagged = bcDocs.some((d) => !d.bargainingCouncil);
  if (hasUntagged) return true;
  const applicableSet = new Set(applicableCodes);
  for (const code of tagged) {
    if (applicableSet.has(code)) return true;
  }
  return false;
}

/**
 * Check if Typed expiry mismatches extracted expiry.
 */
export function isExpiryMismatch(
  typedExpiry: string | null | undefined,
  extractedExpiry: string | null | undefined,
): boolean {
  if (!typedExpiry || !extractedExpiry) return false;
  // Normalize to YYYY-MM-DD
  const norm = (s: string) => s.slice(0, 10);
  return norm(typedExpiry) !== norm(extractedExpiry);
}

export const REMINDER_THRESHOLDS = [30, 7, 0] as const;
