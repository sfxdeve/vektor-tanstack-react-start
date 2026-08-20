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

export const NEEDS_EXPIRY_TYPES = new Set<DocType>([
  "BBBEE",
  "COIDA",
  "TAX_PIN",
  "BARGAINING_COUNCIL_GOS",
]);

export function isBcGos(docType: string): boolean {
  return docType === "BARGAINING_COUNCIL_GOS";
}

export type VaultDocMutation = {
  expiry_date: string;
  is_compliant: boolean;
  bargaining_council: string | null;
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

function decodeBytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

export function extractBbbeeLevelFromBytes(bytes: Uint8Array): number | null {
  const text = decodeBytesToText(bytes);
  return extractBbbeeLevelFromText(text);
}

export function extractExpiryFromBytes(bytes: Uint8Array): string | null {
  const text = decodeBytesToText(bytes);
  return extractExpiryFromText(text);
}

/**
 * Workers-native PDF text extraction via pdfjs-dist with TextDecoder fallback.
 * Tries pdfjs for real binary PDFs (compressed streams), falls back to raw
 * text scan for text-based PDFs and for environments where pdfjs fails.
 */
export async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  const raw = decodeBytesToText(bytes);
  const header = raw.slice(0, 5);
  if (!header.startsWith("%PDF")) return raw;

  try {
    const pdfjs = (await import("pdfjs-dist")) as unknown as {
      getDocument: (opts: unknown) => { promise: Promise<unknown> };
      GlobalWorkerOptions: { workerSrc: string };
    };
    // Disable worker in Workers/Node — run on main thread
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0,
    });
    const doc = (await (
      loadingTask as unknown as {
        promise: Promise<{
          numPages: number;
          getPage: (
            n: number,
          ) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
        }>;
      }
    ).promise) as {
      numPages: number;
      getPage: (
        n: number,
      ) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
    };
    const pages = Math.min(doc.numPages, 5);
    let out = "";
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (item.str) out += item.str + " ";
      }
      out += "\n";
    }
    // If pdfjs produced meaningful text, prefer it; else fall back
    if (out.trim().length > 10) return out;
    return raw;
  } catch {
    return raw;
  }
}

export async function extractBbbeeLevelFromPdfBytes(bytes: Uint8Array): Promise<number | null> {
  const text = await extractTextFromPdfBytes(bytes);
  return extractBbbeeLevelFromText(text);
}

export async function extractExpiryFromPdfBytes(bytes: Uint8Array): Promise<string | null> {
  const text = await extractTextFromPdfBytes(bytes);
  return extractExpiryFromText(text);
}

/**
 * Validate doc_type + bargainingCouncil combination.
 * Returns normalized bargainingCouncil or throws.
 */
export function validateBargainingCouncil(
  docType: string,
  bargainingCouncil: string | null | undefined,
): string | null {
  if (isBcGos(docType)) {
    if (!bargainingCouncil || String(bargainingCouncil).trim() === "") {
      throw new Error("bargaining_council code is required for Bargaining Council letters");
    }
    const code = String(bargainingCouncil).trim();
    if (!VALID_COUNCIL_CODES.has(code)) {
      throw new Error(`Unknown bargaining council code: ${code}`);
    }
    return code;
  }
  return null;
}

/**
 * Bargaining council coverage: legacy untagged compliant docs cover any council
 * when they are also not expired. Expired documents never cover, even if untagged.
 */
export function isBargainingCouncilCovered(
  applicableCodes: string[],
  docs: Array<{
    bargainingCouncil: string | null;
    isCompliant: boolean;
    expiryDate?: string | Date | null;
  }>,
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  const isExpired = (d: { expiryDate?: string | Date | null }): boolean => {
    if (!d.expiryDate) return false;
    const t =
      d.expiryDate instanceof Date ? d.expiryDate.getTime() : new Date(d.expiryDate).getTime();
    return Number.isNaN(t) ? false : t < nowMs;
  };

  const bcDocs = docs.filter((d) => d.isCompliant && !isExpired(d));
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

export function isExpiryMismatch(
  typedExpiry: string | null | undefined,
  extractedExpiry: string | null | undefined,
): boolean {
  if (!typedExpiry || !extractedExpiry) return false;
  const norm = (s: string) => s.slice(0, 10);
  return norm(typedExpiry) !== norm(extractedExpiry);
}

export function isBbbeeMismatch(
  profileLevel: number | null | undefined,
  certLevel: number | null | undefined,
): boolean {
  if (profileLevel == null || certLevel == null) return false;
  return Number(profileLevel) !== Number(certLevel);
}

export const REMINDER_THRESHOLDS = [30, 7, 0] as const;
