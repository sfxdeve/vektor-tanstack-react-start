import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { and, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { complianceDocuments } from "@/db/schema/compliance";
import { companies } from "@/db/schema/company";
import { eftPayments } from "@/db/schema/eft";
import { tenders } from "@/db/schema/tender";
import { requireAdmin } from "@/lib/server-auth";

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const db = createDb(env.DB);
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const scalar = async (q: Promise<Array<{ n: number }>>): Promise<number> =>
          Number((await q)[0]?.n ?? 0);
        const total = <C extends Parameters<typeof db.$count>[0]>(t: C) => db.$count(t);

        const [
          usersTotal,
          adminsTotal,
          usersNew30d,
          companiesTotal,
          companiesNew30d,
          tendersTotal,
          tendersNew30d,
          docsTotal,
          docsExpiring30d,
          activeSubs,
          pendingReview,
        ] = await Promise.all([
          total(user),
          scalar(db.select({ n: count() }).from(user).where(eq(user.role, "admin"))),
          scalar(db.select({ n: count() }).from(user).where(gte(user.createdAt, thirtyDaysAgo))),
          total(companies),
          scalar(
            db
              .select({ n: count() })
              .from(companies)
              .where(gte(companies.createdAt, thirtyDaysAgo)),
          ),
          total(tenders),
          scalar(
            db.select({ n: count() }).from(tenders).where(gte(tenders.createdAt, thirtyDaysAgo)),
          ),
          total(complianceDocuments),
          scalar(
            db
              .select({ n: count() })
              .from(complianceDocuments)
              .where(
                and(
                  eq(complianceDocuments.isCompliant, true),
                  isNotNull(complianceDocuments.expiryDate),
                  lte(complianceDocuments.expiryDate, in30Days),
                ),
              ),
          ),
          scalar(
            db
              .select({ n: sql<number>`count(distinct ${eftPayments.companyId})` })
              .from(eftPayments)
              .where(
                and(eq(eftPayments.status, "confirmed"), eq(eftPayments.type, "subscription")),
              ),
          ),
          scalar(
            db
              .select({ n: count() })
              .from(eftPayments)
              .where(eq(eftPayments.status, "pending_review")),
          ),
        ]);

        return Response.json({
          users: { total: usersTotal, admins: adminsTotal, new_30d: usersNew30d },
          companies: { total: companiesTotal, new_30d: companiesNew30d },
          tenders: { total: tendersTotal, new_30d: tendersNew30d },
          documents: { total: docsTotal, expiring_30d: docsExpiring30d },
          subscriptions: { active: activeSubs },
          eft: { pending_review: pendingReview },
          generated_at: now.toISOString(),
        });
      },
    },
  },
});
