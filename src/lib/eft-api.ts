import { eq as drizzleEq } from "drizzle-orm";

import type { eftPayments } from "@/db/schema/eft";
import { ALLOWED_TRANSITIONS, type EftStatus } from "@/lib/eft";

// Drizzle's typed eq requires column/table generics; route handlers use a loosely-typed
// shim so they can call `eq(column, value)` without threading table types through createDb.
// Centralise the cast here so 7 route files don't duplicate it.
export const eq = drizzleEq as unknown as (a: unknown, b: unknown) => unknown;

export type EftRow = typeof eftPayments.$inferSelect;

// Single serializer for EFT rows — replaces 7 duplicated toApi implementations.
export function toApiEftPayment(payment: EftRow) {
  return {
    id: payment.id,
    reference: payment.reference,
    reference_display: payment.reference,
    user_id: payment.userId,
    user_email: payment.userEmail,
    company_id: payment.companyId,
    company_name: payment.companyName,
    lookup_key: payment.lookupKey,
    package_name: payment.packageName,
    amount: payment.amount / 100,
    amount_cents: payment.amount,
    credits: payment.credits,
    annual_credits: payment.annualCredits,
    billing_period: payment.billingPeriod,
    type: payment.type,
    status: payment.status,
    proof_path: payment.proofPath,
    proof_content_type: payment.proofContentType,
    proof_filename: payment.proofFilename,
    reject_reason: payment.rejectReason,
    created_at: new Date(payment.createdAt).toISOString(),
    updated_at: new Date(payment.updatedAt).toISOString(),
    confirmed_at: payment.confirmedAt ? new Date(payment.confirmedAt).toISOString() : null,
    rejected_at: payment.rejectedAt ? new Date(payment.rejectedAt).toISOString() : null,
    credits_granted: payment.creditsGranted,
    confirmed_by: (payment as unknown as { confirmedBy?: string }).confirmedBy ?? null,
    rejected_by: (payment as unknown as { rejectedBy?: string }).rejectedBy ?? null,
  };
}

export type EftApiPayment = ReturnType<typeof toApiEftPayment>;

// Central transition guard — replaces repeated switch/if cascades in 4 handlers.
export function canTransition(from: EftStatus, to: EftStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertCanTransition(from: EftStatus, to: EftStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot transition from ${from} to ${to}`);
  }
}
