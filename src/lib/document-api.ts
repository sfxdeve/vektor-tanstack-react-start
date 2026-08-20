import type { complianceDocuments } from "@/db/schema/compliance";

type DocRow = typeof complianceDocuments.$inferSelect;

export function toApiDoc(row: DocRow) {
  const expiry = row.expiryDate ? new Date(row.expiryDate).toISOString().slice(0, 10) : null;
  const extractedExpiry = row.extractedExpiryDate
    ? new Date(row.extractedExpiryDate).toISOString().slice(0, 10)
    : null;
  return {
    id: row.id,
    company_id: row.companyId,
    doc_type: row.docType,
    file_name: row.fileName,
    expiry_date: expiry,
    is_compliant: Boolean(row.isCompliant),
    storage_path: row.storageKey,
    storage_key: row.storageKey,
    bargaining_council: row.bargainingCouncil ?? null,
    extracted_bbbee_level: row.extractedBbbeeLevel ?? null,
    extracted_expiry_date: extractedExpiry,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

export type ApiDoc = ReturnType<typeof toApiDoc>;
