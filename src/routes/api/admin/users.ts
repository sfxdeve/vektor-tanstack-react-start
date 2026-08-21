// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || url.searchParams.get("search") || "")
          .trim()
          .toLowerCase();

        const db = createDb(env.DB as unknown as D1Database);
        const usersRows = await db.select().from(user);
        const companiesRows = await db.select().from(companies);

        // company counts per user
        const companyCountMap: Record<string, number> = {};
        for (const c of companiesRows) {
          const uid = (c as unknown as { userId: string }).userId;
          companyCountMap[uid] = (companyCountMap[uid] ?? 0) + 1;
        }

        let filtered = usersRows;
        if (q) {
          filtered = usersRows.filter((u) => {
            const email = (u.email || "").toLowerCase();
            const name = (u.name || "").toLowerCase();
            const id = (u.id || "").toLowerCase();
            return email.includes(q) || name.includes(q) || id.includes(q);
          });
        }
        filtered.sort(
          (a, b) =>
            new Date(b.createdAt as unknown as string | Date).getTime() -
            new Date(a.createdAt as unknown as string | Date).getTime(),
        );

        // enrich with compliance summary if needed for search detail later — keep lightweight
        const result = filtered.map((u) => {
          const {
            id,
            name,
            email,
            role,
            referralCode,
            referredByUserId,
            referredByCode,
            createdAt,
            updatedAt,
            emailVerified,
            banned,
            banReason,
          } = u as unknown as Record<string, unknown>;
          return {
            id,
            name,
            email,
            role,
            referral_code: referralCode,
            referred_by_user_id: referredByUserId,
            referred_by_code: referredByCode,
            email_verified: emailVerified,
            banned,
            ban_reason: banReason,
            created_at: createdAt ? new Date(createdAt as string | Date).toISOString() : null,
            updated_at: updatedAt ? new Date(updatedAt as string | Date).toISOString() : null,
            company_count: companyCountMap[u.id as string] ?? 0,
          };
        });

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
