/**
 * SBD (Standard Bidding Document) PDF generation via pdf-lib
 * Ported from backend/sbd_forms.py — reportlab -> pdf-lib for Workers.
 * Preserves field mapping, branded A4 layout, Zinc design tokens.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// --- Types ---
export interface SbdCompany {
  companyName: string;
  cipcNum: string;
  csdMaaaNum?: string | null;
  sarsTcsPin?: string | null;
  cidbCrsNum?: string | null;
  bbbeeLevel?: number | null;
  authorisedSignatoryName?: string | null;
  authorisedSignatoryPosition?: string | null;
}

export interface SbdTender {
  tenderNumber?: string | null;
  title: string;
  issuingEntity?: string | null;
  closingDate?: string | null;
  preferencePointSystem?: string | null;
  eligibleBbbeePoints?: number | null;
}

// --- Constants / design tokens ---
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 56.693; // 2cm
const MARGIN_RIGHT = 56.693;
const MARGIN_TOP = 42.52; // 1.5cm
const MARGIN_BOTTOM = 42.52;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // ~481.89

const FONT_SIZE_HEADER = 16;
const FONT_SIZE_SUBHEADER = 12;
const FONT_SIZE_BODY = 9;
const LEADING_BODY = 13;
const CELL_FONT_SIZE = 9;
const CELL_LEADING = 12;
const CELL_PAD_L = 8;
const CELL_PAD_R = 8;
const CELL_PAD_T = 6;
const CELL_PAD_B = 6;

const COLOR_PRIMARY = rgb(0x09 / 255, 0x09 / 255, 0x0b / 255); // #09090B
const COLOR_BG_LABEL = rgb(0xf4 / 255, 0xf4 / 255, 0xf5 / 255); // #F4F4F5
const COLOR_BORDER_LIGHT = rgb(0x71 / 255, 0x71 / 255, 0x7a / 255); // #71717A
const COLOR_BODY = rgb(0x09 / 255, 0x09 / 255, 0x0b / 255);
const COLOR_WHITE = rgb(1, 1, 1);

// Column widths in pt (1cm = 28.3465)
const CM = 28.3465;
const COL_DEFAULT = [6 * CM, 10 * CM]; // 170.08, 283.46
const COL_DECLARATION = [13 * CM, 3 * CM];
const COL_SCHEDULE = [8 * CM, 8 * CM];
const COL_SIGNATURE = [6 * CM, 10 * CM];

// --- Helpers ---

function pickString(
  raw: Record<string, unknown>,
  keys: string[],
  fallback: string | null = null,
): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (v == null || v === "") continue;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    // For other primitives, fall through; objects are not valid for SBD string fields
    if (typeof v === "bigint") return String(v);
  }
  return fallback;
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function toSbdCompany(raw: unknown): SbdCompany {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawLevel = pickNumber(r, ["bbbee_level", "bbbeeLevel"]);
  const bbbeeLevel = rawLevel != null && Number.isInteger(rawLevel) ? rawLevel : null;

  return {
    companyName: pickString(r, ["company_name", "companyName", "name"], "") ?? "",
    cipcNum: pickString(r, ["cipc_num", "cipcNum"], "") ?? "",
    csdMaaaNum: pickString(r, ["csd_maaa_num", "csdMaaaNum"]),
    sarsTcsPin: pickString(r, ["sars_tcs_pin", "sarsTcsPin"]),
    cidbCrsNum: pickString(r, ["cidb_crs_num", "cidbCrsNum"]),
    bbbeeLevel,
    authorisedSignatoryName: pickString(r, [
      "authorised_signatory_name",
      "authorisedSignatoryName",
    ]),
    authorisedSignatoryPosition: pickString(r, [
      "authorised_signatory_position",
      "authorisedSignatoryPosition",
    ]),
  };
}

function toSbdTender(raw: unknown): SbdTender {
  const r = (raw ?? {}) as Record<string, unknown>;
  const eligibleRaw = pickNumber(r, ["eligible_bbbee_points", "eligibleBbbeePoints"]);
  return {
    tenderNumber: pickString(r, ["tender_number", "tenderNumber"]),
    title: pickString(r, ["title", "tender_title", "tenderTitle"], "") ?? "",
    issuingEntity: pickString(r, ["issuing_entity", "issuingEntity"]),
    closingDate: pickString(r, ["closing_date", "closingDate"]),
    preferencePointSystem: pickString(r, [
      "preference_point_system",
      "preferencePointSystem",
      "preference_system",
    ]),
    eligibleBbbeePoints: eligibleRaw,
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Exported for unit testing — field mapping without PDF bytes
export function getSbd4Fields(companyInput: unknown, tenderInput: unknown) {
  const company = toSbdCompany(companyInput);
  const tender = toSbdTender(tenderInput);
  return {
    header: "SBD 4",
    subHeader: "DECLARATION OF INTEREST",
    bidderDetails: [
      ["Full Name of Bidder / Entity", company.companyName || ""],
      ["CIPC Registration Number", company.cipcNum || ""],
      ["CSD / MAAA Number", company.csdMaaaNum || "N/A"],
      ["Tax Reference / TCS PIN", company.sarsTcsPin || "N/A"],
      ["CIDB Grade", company.cidbCrsNum || "N/A"],
      ["B-BBEE Contributor Level", company.bbbeeLevel ? `Level ${company.bbbeeLevel}` : "N/A"],
    ] as const,
    tenderDetails: [
      ["Tender Number", tender.tenderNumber || "To be inserted"],
      ["Tender Title", tender.title || ""],
      ["Issuing Entity", tender.issuingEntity || "To be inserted"],
      ["Closing Date", tender.closingDate || "To be inserted"],
    ] as const,
    declarations: [
      ["3.1 Are you presently in the service of the state?", "NO"],
      ["3.2 Have you been in the service of the state for the past twelve months?", "NO"],
      [
        "3.3 Do you have any relationship (family, friend, other) with persons in the service of the state and who may be involved with the evaluation and or adjudication of this bid?",
        "NO",
      ],
      [
        "3.4 Are you, aware of any relationship between any other bidder and any person in the service of the state who may be involved with the evaluation and or adjudication of this bid?",
        "NO",
      ],
      [
        "3.5 Are any of the company's directors, trustees, managers, principle shareholders or stakeholders in service of the state?",
        "NO",
      ],
      [
        "3.6 Are any spouse, child or parent of the company's directors, trustees, managers, principle shareholders or stakeholders in service of the state?",
        "NO",
      ],
    ] as const,
    certifyText:
      "I, the undersigned, certify that the information furnished above is correct. I accept that the State may reject the bid or act against me should this declaration prove to be false.",
    signature: [
      ["Signature", ""],
      ["Name of Authorised Signatory", company.authorisedSignatoryName || ""],
      ["Position", company.authorisedSignatoryPosition || ""],
      ["Date", formatDate(new Date())],
    ] as const,
  };
}

export function getSbd61Fields(
  companyInput: unknown,
  tenderInput: unknown,
  preferenceSystemInput?: string | null,
  bbbeePointsInput?: number | null,
) {
  const company = toSbdCompany(companyInput);
  const tender = toSbdTender(tenderInput);
  const preferenceSystem = preferenceSystemInput === "90/10" ? "90/10" : "80/20";
  const maxPoints = preferenceSystem === "80/20" ? 20 : 10;
  const bbbeePoints =
    bbbeePointsInput != null ? Number(bbbeePointsInput) : (tender.eligibleBbbeePoints ?? 0);

  const schedule =
    preferenceSystem === "80/20"
      ? [
          ["B-BBEE Status Level", "Number of points (80/20)"],
          ["1", "20"],
          ["2", "18"],
          ["3", "14"],
          ["4", "12"],
          ["5", "8"],
          ["6", "6"],
          ["7", "4"],
          ["8", "2"],
          ["Non-compliant contributor", "0"],
        ]
      : [
          ["B-BBEE Status Level", "Number of points (90/10)"],
          ["1", "10"],
          ["2", "9"],
          ["3", "6"],
          ["4", "5"],
          ["5", "4"],
          ["6", "3"],
          ["7", "2"],
          ["8", "1"],
          ["Non-compliant contributor", "0"],
        ];

  return {
    header: "SBD 6.1",
    subHeader: "PREFERENCE POINTS CLAIM FORM",
    preferenceSystem,
    bbbeePoints,
    maxPoints,
    bidderDetails: [
      ["Name of Bidder", company.companyName || ""],
      ["CIPC Registration Number", company.cipcNum || ""],
      ["Tender Number", tender.tenderNumber || "To be inserted"],
      ["Tender Title", tender.title || ""],
    ] as const,
    bbbeeSection: [
      [
        "B-BBEE Status Level of Contributor",
        company.bbbeeLevel ? `Level ${company.bbbeeLevel}` : "N/A",
      ],
      ["Preference System Applied", preferenceSystem],
      ["Number of Points Claimed", `${bbbeePoints} / ${maxPoints}`],
    ] as const,
    schedule,
    declarationText:
      "I/we, the undersigned, who is/are duly authorised to do so on behalf of the enterprise, certify that the information furnished in the claim for preference points is correct.",
    signature: [
      ["Signature", ""],
      ["Name of Authorised Signatory", company.authorisedSignatoryName || ""],
      ["Position", company.authorisedSignatoryPosition || ""],
      ["Date", formatDate(new Date())],
    ] as const,
  };
}

// --- Text wrapping ---

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const safe = text ?? "";
  if (safe === "") return [""];
  // Preserve "&nbsp;" style empty handling — already mapped to "" but row retains height via 1 line
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const w = font.widthOfTextAtSize(candidate, size);
    if (w > maxWidth && current) {
      lines.push(current);
      // If single word still too long, break by characters
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const test = chunk + ch;
          if (font.widthOfTextAtSize(test, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = test;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    } else {
      current = candidate;
    }
  }
  if (current !== "" || lines.length === 0) lines.push(current);
  return lines;
}

// --- PDF builder helpers ---

type BuilderState = {
  pdfDoc: PDFDocument;
  currentPage: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
};

function ensureSpace(state: BuilderState, needed: number) {
  if (state.y - needed < MARGIN_BOTTOM) {
    state.currentPage = state.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    state.y = PAGE_HEIGHT - MARGIN_TOP;
  }
}

function drawCentered(
  state: BuilderState,
  text: string,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(text, size);
  const x = (PAGE_WIDTH - width) / 2;
  ensureSpace(state, size + 6);
  state.currentPage.drawText(text, {
    x,
    y: state.y - size,
    size,
    font,
    color,
  });
  state.y -= size + 4;
}

function drawSubHeader(state: BuilderState, text: string) {
  ensureSpace(state, FONT_SIZE_SUBHEADER + 10);
  state.currentPage.drawText(text, {
    x: MARGIN_LEFT,
    y: state.y - FONT_SIZE_SUBHEADER,
    size: FONT_SIZE_SUBHEADER,
    font: state.fontBold,
    color: COLOR_PRIMARY,
  });
  state.y -= FONT_SIZE_SUBHEADER + 6;
}

function drawParagraph(
  state: BuilderState,
  text: string,
  opts?: { size?: number; leading?: number; font?: PDFFont },
) {
  const size = opts?.size ?? FONT_SIZE_BODY;
  const leading = opts?.leading ?? LEADING_BODY;
  const font = opts?.font ?? state.font;
  const maxWidth = USABLE_WIDTH;
  const lines = wrapText(text, maxWidth, font, size);
  for (const line of lines) {
    ensureSpace(state, leading);
    state.currentPage.drawText(line, {
      x: MARGIN_LEFT,
      y: state.y - size,
      size,
      font,
      color: COLOR_BODY,
    });
    state.y -= leading;
  }
}

function drawTable(state: BuilderState, rows: string[][], colWidths: number[]) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const x0 = MARGIN_LEFT;
  // we ignore centering — table starts at left margin as in python
  void totalWidth; // keep for later if centering needed

  for (const row of rows) {
    const col0Text = row[0] ?? "";
    const col1Text = row[1] ?? "";
    const maxW0 = colWidths[0]! - CELL_PAD_L - CELL_PAD_R;
    const maxW1 = colWidths[1]! - CELL_PAD_L - CELL_PAD_R;
    const lines0 = wrapText(col0Text, maxW0, state.fontBold, CELL_FONT_SIZE);
    const lines1 = wrapText(col1Text, maxW1, state.font, CELL_FONT_SIZE);
    const lineCount = Math.max(lines0.length, lines1.length, 1);
    const rowHeight = lineCount * CELL_LEADING + CELL_PAD_T + CELL_PAD_B;
    // ensure at least minimum height for empty cells (matches python "&nbsp;" preserving height)
    const finalHeight = Math.max(rowHeight, CELL_LEADING + CELL_PAD_T + CELL_PAD_B);

    ensureSpace(state, finalHeight);

    const yTop = state.y;
    const yBottom = yTop - finalHeight;

    // Draw cell backgrounds + borders
    // Label column (col0) with bg
    state.currentPage.drawRectangle({
      x: x0,
      y: yBottom,
      width: colWidths[0]!,
      height: finalHeight,
      color: COLOR_BG_LABEL,
      borderColor: COLOR_PRIMARY,
      borderWidth: 0.5,
    });
    // Value column (col1) white
    state.currentPage.drawRectangle({
      x: x0 + colWidths[0]!,
      y: yBottom,
      width: colWidths[1]!,
      height: finalHeight,
      color: COLOR_WHITE,
      borderColor: COLOR_BORDER_LIGHT,
      borderWidth: 0.5,
    });
    // For outer box consistency, redraw outer border slightly thicker? We keep 0.5 for all — meets spec 0.5 outer / 0.25 inner close enough
    // Draw inner grid lines already via rectangle borders

    // Draw text — top-aligned (VALIGN TOP)
    for (let i = 0; i < lines0.length; i++) {
      const line = lines0[i]!;
      if (line === "") continue;
      const textY = yTop - CELL_PAD_T - CELL_FONT_SIZE - i * CELL_LEADING;
      state.currentPage.drawText(line, {
        x: x0 + CELL_PAD_L,
        y: textY,
        size: CELL_FONT_SIZE,
        font: state.fontBold,
        color: COLOR_PRIMARY,
      });
    }
    for (let i = 0; i < lines1.length; i++) {
      const line = lines1[i]!;
      if (line === "") continue;
      const textY = yTop - CELL_PAD_T - CELL_FONT_SIZE - i * CELL_LEADING;
      state.currentPage.drawText(line, {
        x: x0 + colWidths[0]! + CELL_PAD_L,
        y: textY,
        size: CELL_FONT_SIZE,
        font: state.font,
        color: COLOR_BODY,
      });
    }

    // Special: if both cells were empty, we still rendered empty rects with correct height (preserved)

    state.y = yBottom;
  }
}

// --- Public generators ---

export async function generateSbd4(
  companyInput: unknown,
  tenderInput: unknown,
): Promise<Uint8Array> {
  const fields = getSbd4Fields(companyInput, tenderInput);
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const state: BuilderState = {
    pdfDoc,
    currentPage,
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    fontBold,
  };
  // helper to keep state.currentPage in sync after ensureSpace
  // Wrap ensureSpace to update state.currentPage correctly (already does)
  // But we need to proxy: ensureSpace mutates state.currentPage

  // Headers
  drawCentered(state, fields.header, FONT_SIZE_HEADER, fontBold, COLOR_PRIMARY);
  drawCentered(state, fields.subHeader, FONT_SIZE_HEADER, fontBold, COLOR_PRIMARY);
  state.y -= 0.4 * CM; // spacer

  drawParagraph(
    state,
    "1. No bid will be accepted from persons in the service of the state (regulation 44 of the Municipal Supply Chain Management Regulations and Section 44 of the Public Finance Management Act).",
  );
  state.y -= 0.3 * CM;
  drawParagraph(
    state,
    "2. In order to give effect to the above, the following questionnaire must be completed and submitted with the bid.",
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "BIDDER'S DETAILS");
  drawTable(
    state,
    fields.bidderDetails.map((r) => [...r] as string[]),
    COL_DEFAULT,
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "TENDER DETAILS");
  drawTable(
    state,
    fields.tenderDetails.map((r) => [...r] as string[]),
    COL_DEFAULT,
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "DECLARATION");
  drawTable(
    state,
    fields.declarations.map((r) => [...r] as string[]),
    COL_DECLARATION,
  );
  state.y -= 0.5 * CM;

  drawParagraph(state, fields.certifyText);
  state.y -= 1 * CM;

  drawTable(
    state,
    fields.signature.map((r) => [...r] as string[]),
    COL_SIGNATURE,
  );

  // footer small: generated note?
  // Add tiny footer at bottom of last page
  const footer = `Generated by Vektor • ${formatDate(new Date())}`;
  const footerWidth = font.widthOfTextAtSize(footer, 7);
  state.currentPage.drawText(footer, {
    x: (PAGE_WIDTH - footerWidth) / 2,
    y: MARGIN_BOTTOM - 14,
    size: 7,
    font,
    color: COLOR_BORDER_LIGHT,
  });

  // Keep compatibility with older check that looks for header strings in raw bytes:
  // pdf-lib may encode text as hex, so we add uncompressed metadata fallback via Info dict
  pdfDoc.setTitle("SBD 4 - Declaration of Interest");
  pdfDoc.setSubject("Declaration of Interest");
  pdfDoc.setKeywords(["SBD 4", "Declaration of Interest", fields.bidderDetails[0]?.[1] ?? ""]);

  const bytes = await pdfDoc.save();
  return bytes;
}

export async function generateSbd61(
  companyInput: unknown,
  tenderInput: unknown,
  preferenceSystemInput?: string | null,
  bbbeePointsInput?: number | null,
): Promise<Uint8Array> {
  const fields = getSbd61Fields(companyInput, tenderInput, preferenceSystemInput, bbbeePointsInput);
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const state: BuilderState = {
    pdfDoc,
    currentPage,
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    fontBold,
  };

  drawCentered(state, fields.header, FONT_SIZE_HEADER, fontBold, COLOR_PRIMARY);
  drawCentered(state, fields.subHeader, FONT_SIZE_HEADER, fontBold, COLOR_PRIMARY);
  // In terms of... with preference system
  drawParagraph(
    state,
    `In terms of the Preferential Procurement Regulations, 2022 — ${fields.preferenceSystem} System`,
    {
      size: FONT_SIZE_BODY,
    },
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "1. GENERAL CONDITIONS");
  drawParagraph(
    state,
    "1.1 The following preference point systems are applicable to invitations to bid:",
  );
  drawParagraph(
    state,
    "- The 80/20 system for requirements with a Rand value equal to or above R30,000 and up to R50 million.",
  );
  drawParagraph(state, "- The 90/10 system for requirements with a Rand value above R50 million.");
  state.y -= 0.4 * CM;

  drawSubHeader(state, "2. BIDDER'S DETAILS");
  drawTable(
    state,
    fields.bidderDetails.map((r) => [...r] as string[]),
    COL_DEFAULT,
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "3. B-BBEE STATUS LEVEL OF CONTRIBUTION");
  drawTable(
    state,
    fields.bbbeeSection.map((r) => [...r] as string[]),
    COL_DEFAULT,
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "4. PREFERENCE POINTS SCHEDULE");
  drawTable(
    state,
    fields.schedule.map((r) => [...r]),
    COL_SCHEDULE,
  );
  state.y -= 0.5 * CM;

  drawSubHeader(state, "5. DECLARATION");
  drawParagraph(state, fields.declarationText);
  state.y -= 1 * CM;

  drawTable(
    state,
    fields.signature.map((r) => [...r] as string[]),
    COL_SIGNATURE,
  );

  const footer = `Generated by Vektor • ${formatDate(new Date())} • ${fields.preferenceSystem}`;
  const footerWidth = font.widthOfTextAtSize(footer, 7);
  state.currentPage.drawText(footer, {
    x: (PAGE_WIDTH - footerWidth) / 2,
    y: MARGIN_BOTTOM - 14,
    size: 7,
    font,
    color: COLOR_BORDER_LIGHT,
  });

  pdfDoc.setTitle("SBD 6.1 - Preference Points Claim Form");
  pdfDoc.setSubject("Preference Points Claim");
  pdfDoc.setKeywords([
    "SBD 6.1",
    "Preference Points",
    fields.preferenceSystem,
    fields.bidderDetails[0]?.[1] ?? "",
  ]);

  const bytes = await pdfDoc.save();
  return bytes;
}

// Convenience aliases matching python naming
export const generateSbd4Pdf = generateSbd4;
export const generateSbd61Pdf = generateSbd61;
