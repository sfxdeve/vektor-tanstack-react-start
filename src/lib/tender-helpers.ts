import type { TenderRow } from "@/db/schema/tender";

function parseJson<T>(
  value: string | null | undefined,
  fallback: T,
  predicate: (v: unknown) => v is T,
): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return predicate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonArray(value: string | null | undefined): unknown[] {
  return parseJson(value, [] as unknown[], isArray);
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  return parseJson(value, {} as Record<string, unknown>, isRecord);
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
