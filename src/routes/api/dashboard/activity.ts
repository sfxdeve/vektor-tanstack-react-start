// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { eftPayments } from "@/db/schema/eft";
import { referralRewards } from "@/db/schema/referral";
import { tenders } from "@/db/schema/tender";
import { getSessionFromRequest } from "@/lib/server-auth";

function verdictFromScore(score: number | null | undefined): string {
  if (score == null) return "UNKNOWN";
  if (score >= 75) return "GO";
  if (score >= 50) return "CAUTION";
  return "NO-GO";
}

export const Route = createFileRoute("/api/dashboard/activity")({
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
        const url = new URL(request.url);
        const typeFilter = url.searchParams.get("type");
        const rawLimit = url.searchParams.get("limit");
        let limit = 10;
        if (rawLimit) {
          const parsed = Number.parseInt(rawLimit, 10);
          if (!Number.isNaN(parsed)) limit = Math.min(50, Math.max(1, parsed));
        }

        if (typeFilter && !["tender", "eft", "referral_reward"].includes(typeFilter)) {
          return new Response(JSON.stringify({ detail: "Invalid type filter" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const wantTender = !typeFilter || typeFilter === "tender";
        const wantEft = !typeFilter || typeFilter === "eft";
        const wantReward = !typeFilter || typeFilter === "referral_reward";

        const db = createDb(env.DB as unknown as D1Database);
        const userId = session.user.id;

        let tenderItems: Record<string, unknown>[] = [];
        if (wantTender) {
          const companyRows = await db.select().from(companies);
          // Drizzle where manual filter for userId
          const owned = companyRows.filter(
            (c) => (c as unknown as { userId: string }).userId === userId,
          );
          const companyIds = new Set(owned.map((c) => c.id));
          if (companyIds.size > 0) {
            const allTenders = await db.select().from(tenders);
            const filtered = allTenders
              .filter((t) => companyIds.has(t.companyId))
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, limit);
            tenderItems = filtered.map((t) => ({
              type: "tender",
              id: t.id,
              created_at: new Date(t.createdAt).toISOString(),
              title: t.title || "Untitled tender",
              issuing_entity: t.issuingEntity,
              fit_score: t.fitScore,
              verdict: verdictFromScore(t.fitScore),
              company_id: t.companyId,
            }));
          }
        }

        let eftItems: Record<string, unknown>[] = [];
        if (wantEft) {
          const all = await db.select().from(eftPayments);
          const filtered = all
            .filter((p) => p.userId === userId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
          eftItems = filtered.map((p) => ({
            type: "eft",
            id: p.id,
            created_at: new Date(p.createdAt).toISOString(),
            reference: p.reference,
            plan_name: p.packageName,
            amount: p.amount / 100,
            status: p.status,
            credits_granted: p.creditsGranted,
            confirmed_at: p.confirmedAt ? new Date(p.confirmedAt).toISOString() : null,
          }));
        }

        let rewardItems: Record<string, unknown>[] = [];
        if (wantReward) {
          const all = await db.select().from(referralRewards);
          const filtered = all
            .filter((r) => r.referrerUserId === userId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
          rewardItems = filtered.map((r) => ({
            type: "referral_reward",
            id: r.id,
            created_at: new Date(r.createdAt).toISOString(),
            credits_granted: r.creditsGranted,
            plan_lookup_key: r.planLookupKey,
            trigger_reference: r.triggerReference,
          }));
        }

        const merged = [...tenderItems, ...eftItems, ...rewardItems]
          .sort((a, b) => {
            const aTime = new Date((a.created_at as string) || 0).getTime();
            const bTime = new Date((b.created_at as string) || 0).getTime();
            return bTime - aTime;
          })
          .slice(0, limit);

        return new Response(
          JSON.stringify({
            items: merged,
            counts: {
              tenders: tenderItems.length,
              eft: eftItems.length,
              referral_rewards: rewardItems.length,
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
