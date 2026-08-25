/**
 * Generates real PDF fixtures (via pdf-lib) used by the e2e suite so PDF text
 * extraction in the Worker (unpdf) is exercised against genuine compressed
 * documents, not plain-text stand-ins. Run once; fixtures are committed.
 *
 *   nubx tsx scripts/make-pdf-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument, StandardFonts } from "pdf-lib";

const outDir = join(import.meta.dirname, "../tests/fixtures");
mkdirSync(outDir, { recursive: true });

async function makePdf(filename: string, lines: string[]): Promise<void> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 760;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 24;
  }
  const bytes = await doc.save();
  writeFileSync(join(outDir, filename), Buffer.from(bytes));
  console.log("wrote", filename);
}

await makePdf("tender-4eb.pdf", [
  "CITY OF TSHWANE METROPOLITAN MUNICIPALITY",
  "INVITATION TO BID: MUN/2024/INFRA-045",
  "",
  "Bid description: Supply and Delivery of Electrical Components",
  "for Municipal Infrastructure programmes.",
  "",
  "Tender required CIDB 4EB or higher.",
  "A compulsory clarification meeting will be held on site.",
  "Closing date: 2025-03-15 at 11:00.",
]);

await makePdf("cert-tax-pin.pdf", [
  "SOUTH AFRICAN REVENUE SERVICE",
  "Tax Compliance Status — PIN Certificate",
  "",
  "This certificate is valid until 2027-01-15.",
]);

await makePdf("cert-bbbee-level2.pdf", [
  "B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE",
  "Entity: Example Construction (Pty) Ltd",
  "B-BBEE Status Level: 2 Contributor",
  "",
  "Certificate expiry date: 2026-12-31",
]);

await makePdf("cert-bccei.pdf", [
  "BARGAINING COUNCIL FOR THE CIVIL ENGINEERING INDUSTRY",
  "Letter of Good Standing — BCCEI",
  "",
  "This letter is valid until 2027-12-31.",
]);

await makePdf("cert-nbcei.pdf", [
  "NATIONAL BARGAINING COUNCIL FOR THE ELECTRICAL INDUSTRY",
  "Letter of Good Standing — NBCEI",
  "",
  "This letter is valid until 2028-01-01.",
]);

await makePdf("cert-bccei-v2.pdf", [
  "BARGAINING COUNCIL FOR THE CIVIL ENGINEERING INDUSTRY",
  "Letter of Good Standing — BCCEI (renewed)",
  "",
  "This letter is valid until 2028-06-01.",
]);

console.log("fixtures written to", outDir);
