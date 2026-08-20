// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { complianceDocuments } from "@/db/schema/compliance";
import { companies } from "@/db/schema/company";
import { eftPayments } from "@/db/schema/eft";
import { user } from "@/db/schema/auth";
import { tenders } from "@/db/schema/tender";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/admin/stats")({
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
        const db = createDb(env.DB as unknown as D1Database);

        const usersRows = await db.select().from(user);
        const companiesRows = await db.select().from(companies);
        const tendersRows = await db.select().from(tenders);
        const docsRows = await db.select().from(complianceDocuments);
        const eftRows = await db.select().from(eftPayments);
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

        const admins = usersRows.filter(
          (u) => (u as unknown as { role?: string }).role === "admin",
        ).length;
        const new30d = usersRows.filter(
          (u) => new Date(u.createdAt as unknown as string | Date).getTime() >= thirtyDaysAgo,
        ).length;
        const companiesNew30d = companiesRows.filter(
          (c) => new Date(c.createdAt as unknown as string | Date).getTime() >= thirtyDaysAgo,
        ).length;
        const tendersNew30d = tendersRows.filter(
          (t) => new Date(t.createdAt as unknown as string | Date).getTime() >= thirtyDaysAgo,
        ).length;

        const expiringThreshold = new Date(now + 30 * 24 * 60 * 60 * 1000);
        const expiring30d = docsRows.filter((d) => {
          if (!d.expiryDate || !d.isCompliant) return false;
          const expiry = new Date(d.expiryDate as unknown as string | Date).getTime();
          return expiry <= expiringThreshold.getTime() && expiry >= now;
        }).length;

        const activeSubs = eftRows.filter(
          (p) => p.status === "confirmed" && p.type === "subscription",
        ).length;
        const pendingReview = eftRows.filter((p) => p.status === "pending_review").length;

        return new Response(
          JSON.stringify({
            users: {
              total: usersRows.length,
              admins,
              new_30d: new30d,
              pending_review: 0,
              suspended: 0,
            },
            companies: { total: companiesRows.length, new_30d: companiesNew30d },
            tenders: { total: tendersRows.length, new_30d: tendersNew30d },
            documents: { total: docsRows.length, expiring_30d: expiring30d },
            subscriptions: { active: activeSubs },
            eft: {
              total: eftRows.length,
              pending_review: pendingReview,
              confirmed: eftRows.filter((p) => p.status === "confirmed").length,
              rejected: eftRows.filter((p) => p.status === "rejected").length,
              awaiting_proof: eftRows.filter((p) => p.status === "awaiting_proof").length,
            },
            generated_at: new Date().toISOString(),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
