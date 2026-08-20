import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";

const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { eftPayments } from "@/db/schema/eft";
import { getSessionFromRequest } from "@/lib/server-auth";

function toApi(payment: typeof eftPayments.$inferSelect) {
  return {
    id: payment.id,
    reference: payment.reference,
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

export const Route = createFileRoute("/api/eft/admin/all")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ detail: "Admin access required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const statusFilter = url.searchParams.get("status");

        const db = createDb(env.DB as unknown as D1Database);
        let rows: (typeof eftPayments.$inferSelect)[];
        if (statusFilter) {
          rows = await (
            db.select().from(eftPayments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof eftPayments.$inferSelect)[]>
          )(eq(eftPayments.status, statusFilter));
        } else {
          rows = await db.select().from(eftPayments);
        }
        rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return new Response(JSON.stringify({ payments: rows.map(toApi) }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
