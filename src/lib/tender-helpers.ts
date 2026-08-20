import type { TenderRow } from "@/db/schema/tender";

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function toApiTender(row: TenderRow) {
  return {
    id: row.id,
    company_id: row.companyId,
    tender_number: row.tenderNumber,
    title: row.title,
    issuing_entity: row.issuingEntity,
    closing_date: row.closingDate,
    required_cidb_grade: row.requiredCidbGrade,
    preference_point_system: row.preferencePointSystem,
    parsed_returnables: parseJsonArray(row.parsedReturnables),
    evaluation_criteria: parseJsonArray(
      (row as unknown as { evaluationCriteria?: string | null }).evaluationCriteria ?? null,
    ),
    fit_score: row.fitScore,
    risk_flags: parseJsonArray(row.riskFlags),
    eligible_bbbee_points: row.eligibleBbbeePoints,
    returnable_status: parseJsonRecord(row.returnableStatus),
    // Canonical key is pdf_storage_key; pdf_storage_path retained as alias for legacy clients
    pdf_storage_key: row.pdfStorageKey,
    pdf_storage_path: row.pdfStorageKey,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

export function toAnalysisResponse(row: TenderRow, returnableStatus: Record<string, unknown>) {
  return {
    tender_id: row.id,
    tender_title: row.title,
    required_cidb: row.requiredCidbGrade,
    mandatory_returnables: parseJsonArray(row.parsedReturnables),
    evaluation_criteria: parseJsonArray(
      (row as unknown as { evaluationCriteria?: string | null }).evaluationCriteria ?? null,
    ),
    fit_score: row.fitScore,
    risk_flags: parseJsonArray(row.riskFlags),
    eligible_bbbee_points: row.eligibleBbbeePoints,
    closing_date: row.closingDate,
    returnable_status: returnableStatus,
    // Back-compat alias for UI convenience
    id: row.id,
  };
}
