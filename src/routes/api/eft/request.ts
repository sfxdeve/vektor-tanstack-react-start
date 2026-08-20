import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { eftPayments } from "@/db/schema/eft";
import { entryByLookup } from "@/lib/billing-catalog";
import { generateReference } from "@/lib/eft";
import { eq, toApiEftPayment } from "@/lib/eft-api";
import { getSessionFromRequest } from "@/lib/server-auth";

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

        // Generate unique VEK-XXXXXX reference — retry on collision, fail fast if still colliding
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
        // Final guard: if the last generated reference still collides, surface a 500
        // rather than letting the DB unique constraint throw an unhandled exception.
        {
          const collision = await (
            db.select().from(eftPayments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof eftPayments.$inferSelect)[]>
          )(eq(eftPayments.reference, reference));
          if (collision.length > 0) {
            return new Response(
              JSON.stringify({ detail: "Could not generate unique reference, please retry" }),
              { status: 500, headers: { "content-type": "application/json" } },
            );
          }
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

        return new Response(JSON.stringify(toApiEftPayment(inserted)), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
