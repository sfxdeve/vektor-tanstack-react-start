import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";

const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { eftPayments } from "@/db/schema/eft";
import { entryByLookup } from "@/lib/billing-catalog";
import { generateReference } from "@/lib/eft";
import { getSessionFromRequest } from "@/lib/server-auth";

function toApi(payment: typeof eftPayments.$inferSelect) {
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
  };
}

export const Route = createFileRoute("/api/eft/request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const lookupKey = (body.lookup_key ?? body.lookupKey ?? "") as string;
        const companyId = (body.company_id ?? body.companyId ?? "") as string;

        if (!lookupKey) {
          return new Response(JSON.stringify({ detail: "lookup_key is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!companyId) {
          return new Response(JSON.stringify({ detail: "company_id is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const entry = entryByLookup(lookupKey);
        if (!entry) {
          return new Response(JSON.stringify({ detail: "Unknown package" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);
        const companyRows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const company = companyRows[0];
        if (!company) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (company.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        // Generate unique reference retry on collision
        let reference = generateReference();
        for (let i = 0; i < 5; i++) {
          const existing = await (
            db.select().from(eftPayments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof eftPayments.$inferSelect)[]>
          )(eq(eftPayments.reference, reference));
          if (existing.length === 0) break;
          reference = generateReference();
        }

        const now = new Date();
        const id = crypto.randomUUID();
        const row = {
          id,
          reference,
          userId: session.user.id,
          userEmail: session.user.email,
          companyId,
          companyName: company.companyName,
          lookupKey,
          packageName: entry.name,
          amount: entry.amount_cents,
          credits: entry.credits,
          annualCredits: entry.annual_credits ?? null,
          billingPeriod: entry.billing_period,
          type: entry.type,
          status: "awaiting_proof" as const,
          proofPath: null,
          proofContentType: null,
          proofFilename: null,
          rejectReason: null,
          createdAt: now,
          updatedAt: now,
          confirmedAt: null,
          confirmedBy: null,
          rejectedAt: null,
          rejectedBy: null,
          creditsGranted: null,
        };

        await db.insert(eftPayments).values(row);

        const inserted = await (
          db.select().from(eftPayments).where as unknown as (
            c: unknown,
          ) => Promise<(typeof eftPayments.$inferSelect)[]>
        )(eq(eftPayments.id, id)).then((r) => r[0]!);

        return new Response(JSON.stringify(toApi(inserted)), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
