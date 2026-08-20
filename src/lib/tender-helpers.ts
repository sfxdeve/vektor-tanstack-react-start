import type { TenderRow } from "@/db/schema/tender";

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
    parsed_returnables: row.parsedReturnables ? JSON.parse(row.parsedReturnables) : [],
    fit_score: row.fitScore,
    risk_flags: row.riskFlags ? JSON.parse(row.riskFlags) : [],
    eligible_bbbee_points: row.eligibleBbbeePoints,
    returnable_status: row.returnableStatus ? JSON.parse(row.returnableStatus) : {},
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
    mandatory_returnables: row.parsedReturnables ? JSON.parse(row.parsedReturnables) : [],
    fit_score: row.fitScore,
    risk_flags: row.riskFlags ? JSON.parse(row.riskFlags) : [],
    eligible_bbbee_points: row.eligibleBbbeePoints,
    closing_date: row.closingDate,
    returnable_status: returnableStatus,
    // also include tender_id alias for UI convenience
    id: row.id,
  };
}
