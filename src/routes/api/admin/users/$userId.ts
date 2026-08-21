// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { referrals, referralRewards } from "@/db/schema/referral";
import { tenders } from "@/db/schema/tender";
import { requireAdmin } from "@/lib/admin-server";

export const Route = createFileRoute("/api/admin/users/$userId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;

        const userId = (params as Record<string, string>).userId;
        const db = createDb(env.DB as unknown as D1Database);

        // Use proper DB where for single lookup
        const rows = (await db
          .select()
          .from(user)
          .where(
            eq(user.id, userId) as unknown as never,
          )) as unknown as (typeof user.$inferSelect)[];
        let target = rows[0];
        if (!target) {
          // Fallback for local preview where drizzle where shim may fail
          const all = await db.select().from(user);
          target = (all as (typeof user.$inferSelect)[]).find((u) => u.id === userId);
        }
        if (!target) {
          return new Response(JSON.stringify({ detail: "User not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        // Efficient queries with where/inArray instead of full scans where possible
        const owned = (await db
          .select()
          .from(companies)
          .where(
            eq(companies.userId, userId) as unknown as never,
          )) as unknown as (typeof companies.$inferSelect)[];
        // Fallback if where fails in local
        const ownedCompanies =
          owned.length > 0
            ? owned
            : (await db.select().from(companies)).filter(
                (c) => (c as unknown as { userId: string }).userId === userId,
              );
        const companyIds = ownedCompanies.map((c) => c.id);

        const fetchByCompanyIds = async <T>(
          table: unknown,
          companyIdCol: unknown,
          ids: string[],
        ): Promise<T[]> => {
          if (ids.length === 0) return [];
          try {
            const rows = (await (
              createDb(env.DB as unknown as D1Database)
                .select()
                .from(table as never).where as unknown as (c: unknown) => Promise<T[]>
            )(inArray(companyIdCol as never, ids) as unknown as never)) as T[];
            return rows;
          } catch {
            const all = (await db.select().from(table as never)) as T[];
            return all.filter((r) =>
              ids.includes((r as unknown as { companyId: string }).companyId),
            );
          }
        };

        const docs = await fetchByCompanyIds<typeof complianceDocuments.$inferSelect>(
          complianceDocuments,
          complianceDocuments.companyId,
          companyIds,
        );
        const userTenders = await fetchByCompanyIds<typeof tenders.$inferSelect>(
          tenders,
          tenders.companyId,
          companyIds,
        );
        const credits = await fetchByCompanyIds<typeof companyCredits.$inferSelect>(
          companyCredits,
          companyCredits.companyId,
          companyIds,
        );
        const reminders = await fetchByCompanyIds<typeof sentReminders.$inferSelect>(
          sentReminders,
          sentReminders.companyId,
          companyIds,
        );

        const eft = (await db
          .select()
          .from(eftPayments)
          .where(eq(eftPayments.userId, userId) as unknown as never)
          .catch(async () =>
            (await db.select().from(eftPayments)).filter(
              (p) => (p as unknown as { userId: string }).userId === userId,
            ),
          )) as unknown as (typeof eftPayments.$inferSelect)[];

        const referralsForUser = (await db
          .select()
          .from(referrals)
          .catch(
            async () => await db.select().from(referrals),
          )) as (typeof referrals.$inferSelect)[];
        const userReferrals = referralsForUser.filter(
          (r) =>
            (r as unknown as { referrerUserId: string }).referrerUserId === userId ||
            (r as unknown as { refereeUserId: string }).refereeUserId === userId,
        );
        const rewardsAll = (await db
          .select()
          .from(referralRewards)
          .catch(
            async () => await db.select().from(referralRewards),
          )) as (typeof referralRewards.$inferSelect)[];
        const rewards = rewardsAll.filter(
          (rr) => (rr as unknown as { referrerUserId: string }).referrerUserId === userId,
        );

        const compliantCount = docs.filter(
          (d) => (d as unknown as { isCompliant?: boolean }).isCompliant,
        ).length;
        const expiredCount = docs.filter((d) => {
          const expiry = (d as unknown as { expiryDate?: unknown }).expiryDate;
          if (!expiry) return false;
          return new Date(expiry as string | Date).getTime() < Date.now();
        }).length;

        return new Response(
          JSON.stringify({
            user: {
              id: target.id,
              name: target.name,
              email: target.email,
              role: (target as unknown as { role?: string }).role,
              referral_code: (target as unknown as { referralCode?: string }).referralCode,
              referred_by_user_id: (target as unknown as { referredByUserId?: string })
                .referredByUserId,
              referred_by_code: (target as unknown as { referredByCode?: string }).referredByCode,
              email_verified: target.emailVerified,
              banned: (target as unknown as { banned?: boolean }).banned,
              created_at: target.createdAt
                ? new Date(target.createdAt as unknown as string | Date).toISOString()
                : null,
              updated_at: target.updatedAt
                ? new Date(target.updatedAt as unknown as string | Date).toISOString()
                : null,
            },
            companies: ownedCompanies.map((c) => ({
              id: c.id,
              company_name: (c as unknown as { companyName: string }).companyName,
              cipc_num: (c as unknown as { cipcNum: string }).cipcNum,
              created_at: new Date((c as unknown as { createdAt: Date }).createdAt).toISOString(),
            })),
            compliance: {
              total: docs.length,
              compliant: compliantCount,
              expired: expiredCount,
              docs: docs.map((d) => ({
                id: (d as unknown as { id: string }).id,
                doc_type: (d as unknown as { docType: string }).docType,
                file_name: (d as unknown as { fileName: string }).fileName,
                expiry_date: (d as unknown as { expiryDate?: unknown }).expiryDate
                  ? new Date((d as unknown as { expiryDate: Date }).expiryDate).toISOString()
                  : null,
                is_compliant: (d as unknown as { isCompliant: boolean }).isCompliant,
              })),
            },
            tenders: {
              total: userTenders.length,
              items: userTenders.slice(0, 20).map((t) => ({
                id: (t as unknown as { id: string }).id,
                title: (t as unknown as { title: string }).title,
                fit_score: (t as unknown as { fitScore: number }).fitScore,
                created_at: new Date((t as unknown as { createdAt: Date }).createdAt).toISOString(),
              })),
            },
            credits: credits.map((cc) => ({
              company_id: (cc as unknown as { companyId: string }).companyId,
              credits: (cc as unknown as { credits: number }).credits,
            })),
            eft: {
              total: eft.length,
              payments: eft.map((p) => ({
                id: (p as unknown as { id: string }).id,
                reference: (p as unknown as { reference: string }).reference,
                status: (p as unknown as { status: string }).status,
                amount: (p as unknown as { amount: number }).amount / 100,
                credits: (p as unknown as { credits: number }).credits,
                created_at: new Date((p as unknown as { createdAt: Date }).createdAt).toISOString(),
              })),
            },
            reminders: {
              total: reminders.length,
              items: reminders.slice(0, 20).map((r) => ({
                id: (r as unknown as { id: string }).id,
                threshold: (r as unknown as { threshold: number }).threshold,
                sent_at: new Date((r as unknown as { sentAt: Date }).sentAt).toISOString(),
              })),
            },
            referrals: {
              total: userReferrals.length,
              items: userReferrals.slice(0, 20).map((r) => ({
                id: (r as unknown as { id: string }).id,
                code: (r as unknown as { code: string }).code,
                status: (r as unknown as { status: string }).status,
              })),
            },
            referral_rewards: {
              total: rewards.length,
              credits_earned: rewards.reduce(
                (s, rr) => s + ((rr as unknown as { creditsGranted: number }).creditsGranted ?? 0),
                0,
              ),
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
      DELETE: async ({ request, params }) => {
        const adminCheck = await requireAdmin(request);
        if (adminCheck instanceof Response) return adminCheck;
        const session = adminCheck;
        const userId = (params as Record<string, string>).userId;
        if (userId === session.user.id) {
          return new Response(JSON.stringify({ detail: "You cannot delete yourself" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        let body: Record<string, unknown> = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          // ignore
        }
        const reason = ((body.reason as string) || "").trim();
        const confirmEmail = ((body.confirm_email as string) || (body.confirmEmail as string) || "")
          .trim()
          .toLowerCase();

        if (!reason) {
          return new Response(JSON.stringify({ detail: "A reason is required for deletion" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);
        const targetRows = (await db
          .select()
          .from(user)
          .where(eq(user.id, userId) as unknown as never)
          .catch(async () =>
            (await db.select().from(user)).filter((u) => u.id === userId),
          )) as (typeof user.$inferSelect)[];
        const target =
          targetRows[0] ??
          ((await db.select().from(user)).find((u) => u.id === userId) as
            | typeof user.$inferSelect
            | undefined);
        if (!target) {
          return new Response(JSON.stringify({ detail: "User not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if ((target as unknown as { role?: string }).role === "admin") {
          return new Response(JSON.stringify({ detail: "Cannot delete an admin account" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (confirmEmail !== (target.email || "").toLowerCase()) {
          return new Response(
            JSON.stringify({ detail: "Confirmation email doesn't match target user's email" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (!confirmEmail) {
          return new Response(JSON.stringify({ detail: "Confirmation email is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const ownedCompanies = (await db
          .select()
          .from(companies)
          .where(eq(companies.userId, userId) as unknown as never)
          .catch(async () =>
            (await db.select().from(companies)).filter(
              (c) => (c as unknown as { userId: string }).userId === userId,
            ),
          )) as (typeof companies.$inferSelect)[];
        const companyIds = ownedCompanies.map((c) => c.id);

        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;

        // Collect R2 keys via efficient queries
        const collectKeys = async () => {
          const docRows =
            companyIds.length > 0
              ? ((await db
                  .select()
                  .from(complianceDocuments)
                  .where(inArray(complianceDocuments.companyId, companyIds) as unknown as never)
                  .catch(async () =>
                    (await db.select().from(complianceDocuments)).filter((d) =>
                      companyIds.includes((d as unknown as { companyId: string }).companyId),
                    ),
                  )) as (typeof complianceDocuments.$inferSelect)[])
              : [];
          const tenderRows =
            companyIds.length > 0
              ? ((await db
                  .select()
                  .from(tenders)
                  .where(inArray(tenders.companyId, companyIds) as unknown as never)
                  .catch(async () =>
                    (await db.select().from(tenders)).filter((t) =>
                      companyIds.includes((t as unknown as { companyId: string }).companyId),
                    ),
                  )) as (typeof tenders.$inferSelect)[])
              : [];
          const eftRows = (await db
            .select()
            .from(eftPayments)
            .where(eq(eftPayments.userId, userId) as unknown as never)
            .catch(async () =>
              (await db.select().from(eftPayments)).filter(
                (p) =>
                  (p as unknown as { userId: string }).userId === userId ||
                  companyIds.includes((p as unknown as { companyId: string }).companyId),
              ),
            )) as (typeof eftPayments.$inferSelect)[];
          const docKeys = docRows
            .map((d) => (d as unknown as { storageKey?: string }).storageKey)
            .filter(Boolean) as string[];
          const tenderKeys = tenderRows
            .map((t) => (t as unknown as { pdfStorageKey?: string }).pdfStorageKey)
            .filter(Boolean) as string[];
          const eftKeys = eftRows
            .map((p) => (p as unknown as { proofPath?: string }).proofPath)
            .filter(Boolean) as string[];
          return { docKeys, tenderKeys, eftKeys, docRows, tenderRows, eftRows };
        };
        const { docKeys, tenderKeys, eftKeys, docRows, tenderRows } = await collectKeys();
        if (storage) {
          for (const key of [...docKeys, ...tenderKeys, ...eftKeys]) {
            try {
              await storage.delete(key);
            } catch {}
          }
        }

        // Cascade counts for audit
        const eftForCount = (await db
          .select()
          .from(eftPayments)
          .catch(
            async () => await db.select().from(eftPayments),
          )) as (typeof eftPayments.$inferSelect)[];
        const referralsAll = (await db
          .select()
          .from(referrals)
          .catch(
            async () => await db.select().from(referrals),
          )) as (typeof referrals.$inferSelect)[];
        const rewardsAll = (await db
          .select()
          .from(referralRewards)
          .catch(
            async () => await db.select().from(referralRewards),
          )) as (typeof referralRewards.$inferSelect)[];
        const remindersAll = (await db
          .select()
          .from(sentReminders)
          .catch(
            async () => await db.select().from(sentReminders),
          )) as (typeof sentReminders.$inferSelect)[];
        const cascadeCounts: Record<string, number> = {
          documents: docRows.length,
          tenders: tenderRows.length,
          sent_reminders: remindersAll.filter((r) =>
            companyIds.includes((r as unknown as { companyId: string }).companyId),
          ).length,
          manual_payments: eftForCount.filter(
            (p) =>
              (p as unknown as { userId: string }).userId === userId ||
              companyIds.includes((p as unknown as { companyId: string }).companyId),
          ).length,
          referrals: referralsAll.filter(
            (r) =>
              (r as unknown as { referrerUserId: string }).referrerUserId === userId ||
              (r as unknown as { refereeUserId: string }).refereeUserId === userId,
          ).length,
          referral_rewards: rewardsAll.filter(
            (rr) =>
              (rr as unknown as { referrerUserId: string }).referrerUserId === userId ||
              (rr as unknown as { refereeUserId: string }).refereeUserId === userId ||
              companyIds.includes(
                (rr as unknown as { referrerCompanyId: string }).referrerCompanyId,
              ),
          ).length,
          companies: ownedCompanies.length,
        };

        // Bulk deletes with inArray where possible
        if (companyIds.length > 0) {
          try {
            await db
              .delete(complianceDocuments)
              .where(inArray(complianceDocuments.companyId, companyIds) as unknown as never);
          } catch {
            for (const d of docRows) {
              try {
                await (
                  db.delete(complianceDocuments).where as unknown as (
                    c: unknown,
                  ) => Promise<unknown>
                )(eq(complianceDocuments.id, (d as unknown as { id: string }).id));
              } catch {}
            }
          }
          try {
            await db
              .delete(tenders)
              .where(inArray(tenders.companyId, companyIds) as unknown as never);
          } catch {
            for (const t of tenderRows) {
              try {
                await (db.delete(tenders).where as unknown as (c: unknown) => Promise<unknown>)(
                  eq(tenders.id, (t as unknown as { id: string }).id),
                );
              } catch {}
            }
          }
          try {
            await db
              .delete(sentReminders)
              .where(inArray(sentReminders.companyId, companyIds) as unknown as never);
          } catch {
            for (const r of remindersAll.filter((x) =>
              companyIds.includes((x as unknown as { companyId: string }).companyId),
            )) {
              try {
                await (
                  db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>
                )(eq(sentReminders.id, (r as unknown as { id: string }).id));
              } catch {}
            }
          }
          try {
            await db
              .delete(companyCredits)
              .where(inArray(companyCredits.companyId, companyIds) as unknown as never);
          } catch {
            for (const cc of (await db.select().from(companyCredits)).filter((c) =>
              companyIds.includes((c as unknown as { companyId: string }).companyId),
            )) {
              try {
                await (
                  db.delete(companyCredits).where as unknown as (c: unknown) => Promise<unknown>
                )(eq(companyCredits.companyId, (cc as unknown as { companyId: string }).companyId));
              } catch {}
            }
          }
          // Referral rewards by company
          try {
            await db
              .delete(referralRewards)
              .where(inArray(referralRewards.referrerCompanyId, companyIds) as unknown as never);
          } catch {}
        }
        // EFT by user (and also by company if any left)
        try {
          await db.delete(eftPayments).where(eq(eftPayments.userId, userId) as unknown as never);
        } catch {}
        if (companyIds.length > 0) {
          try {
            await db
              .delete(eftPayments)
              .where(inArray(eftPayments.companyId, companyIds) as unknown as never);
          } catch {}
        }
        // Referrals and rewards by user
        try {
          await db
            .delete(referrals)
            .where(eq(referrals.referrerUserId, userId) as unknown as never);
        } catch {}
        try {
          await db.delete(referrals).where(eq(referrals.refereeUserId, userId) as unknown as never);
        } catch {}
        try {
          await db
            .delete(referralRewards)
            .where(eq(referralRewards.referrerUserId, userId) as unknown as never);
        } catch {}
        try {
          await db
            .delete(referralRewards)
            .where(eq(referralRewards.refereeUserId, userId) as unknown as never);
        } catch {}

        // Delete companies then user
        if (companyIds.length > 0) {
          try {
            await db.delete(companies).where(inArray(companies.id, companyIds) as unknown as never);
          } catch {
            for (const c of ownedCompanies) {
              try {
                await (db.delete(companies).where as unknown as (cnd: unknown) => Promise<unknown>)(
                  eq(companies.id, c.id),
                );
              } catch {}
            }
          }
        }
        try {
          await (db.delete(user).where as unknown as (c: unknown) => Promise<unknown>)(
            eq(user.id, userId),
          );
        } catch {
          return new Response(JSON.stringify({ detail: "Failed to delete user" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            status: "deleted",
            user_id: userId,
            email: target.email,
            cascade_counts: cascadeCounts,
            reason,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
