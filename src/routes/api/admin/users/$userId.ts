// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { complianceDocuments, sentReminders } from "@/db/schema/compliance";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments } from "@/db/schema/eft";
import { referrals, referralRewards } from "@/db/schema/referral";
import { tenders } from "@/db/schema/tender";
import { getSessionFromRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/admin/users/$userId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
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
        const userId = (params as Record<string, string>).userId;
        const db = createDb(env.DB as unknown as D1Database);
        const rows = (await db
          .select()
          .from(user)
          .where(
            eq(user.id, userId) as unknown as never,
          )) as unknown as (typeof user.$inferSelect)[];
        // Fallback if eq shim fails: fetch all and filter
        let target: typeof user.$inferSelect | undefined = (
          rows as unknown as (typeof user.$inferSelect)[]
        )[0];
        if (!target) {
          const all = await db.select().from(user);
          target = (all as (typeof user.$inferSelect)[]).find((u) => u.id === userId);
        }
        if (!target) {
          return new Response(JSON.stringify({ detail: "User not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const companiesRows = await db.select().from(companies);
        const owned = companiesRows.filter(
          (c) => (c as unknown as { userId: string }).userId === userId,
        );
        const companyIds = new Set(owned.map((c) => c.id));

        const allDocs = await db.select().from(complianceDocuments);
        const docs = allDocs.filter((d) =>
          companyIds.has((d as unknown as { companyId: string }).companyId),
        );
        const allTenders = await db.select().from(tenders);
        const userTenders = allTenders.filter((t) =>
          companyIds.has((t as unknown as { companyId: string }).companyId),
        );
        const allCredits = await db.select().from(companyCredits);
        const credits = allCredits.filter((cc) =>
          companyIds.has((cc as unknown as { companyId: string }).companyId),
        );
        const allEft = await db.select().from(eftPayments);
        const eft = allEft.filter((p) => (p as unknown as { userId: string }).userId === userId);
        const allReminders = await db.select().from(sentReminders);
        const reminders = allReminders.filter((r) =>
          companyIds.has((r as unknown as { companyId: string }).companyId),
        );
        const allReferrals = await db.select().from(referrals);
        const userReferrals = allReferrals.filter(
          (r) =>
            (r as unknown as { referrerUserId: string }).referrerUserId === userId ||
            (r as unknown as { refereeUserId: string }).refereeUserId === userId,
        );
        const allRewards = await db.select().from(referralRewards);
        const rewards = allRewards.filter(
          (rr) => (rr as unknown as { referrerUserId: string }).referrerUserId === userId,
        );

        // compliance state: count compliant docs etc.
        const compliantCount = docs.filter(
          (d) => (d as unknown as { isCompliant?: boolean }).isCompliant,
        ).length;
        const expiredCount = docs.filter((d) => {
          const expiry = (d as unknown as { expiryDate?: unknown }).expiryDate;
          if (!expiry) return false;
          const t = new Date(expiry as string | Date).getTime();
          return t < Date.now();
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
            companies: owned.map((c) => ({
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
        const allUsers = await db.select().from(user);
        const target = allUsers.find((u) => u.id === userId) as
          | typeof user.$inferSelect
          | undefined;
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
        if (confirmEmail && confirmEmail !== (target.email || "").toLowerCase()) {
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

        // Collect company ids owned by user
        const companiesRows = await db.select().from(companies);
        const ownedCompanies = companiesRows.filter(
          (c) => (c as unknown as { userId: string }).userId === userId,
        );
        const companyIds = ownedCompanies.map((c) => c.id);

        // Collect R2 keys to delete best-effort
        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        let docKeys: string[] = [];
        let tenderKeys: string[] = [];
        let eftKeys: string[] = [];
        try {
          if (companyIds.length > 0) {
            const allDocs = await db.select().from(complianceDocuments);
            const docs = allDocs.filter((d) =>
              companyIds.includes((d as unknown as { companyId: string }).companyId),
            );
            docKeys = docs
              .map((d) => (d as unknown as { storageKey?: string }).storageKey)
              .filter(Boolean) as string[];
            const allTenders = await db.select().from(tenders);
            const tRows = allTenders.filter((t) =>
              companyIds.includes((t as unknown as { companyId: string }).companyId),
            );
            tenderKeys = tRows
              .map((t) => (t as unknown as { pdfStorageKey?: string }).pdfStorageKey)
              .filter(Boolean) as string[];
            const allEft = await db.select().from(eftPayments);
            const eRows = allEft.filter(
              (p) =>
                (p as unknown as { userId: string }).userId === userId ||
                companyIds.includes((p as unknown as { companyId: string }).companyId),
            );
            eftKeys = eRows
              .map((p) => (p as unknown as { proofPath?: string }).proofPath)
              .filter(Boolean) as string[];
          } else {
            const allEft = await db.select().from(eftPayments);
            const eRows = allEft.filter(
              (p) => (p as unknown as { userId: string }).userId === userId,
            );
            eftKeys = eRows
              .map((p) => (p as unknown as { proofPath?: string }).proofPath)
              .filter(Boolean) as string[];
          }
          if (storage) {
            for (const key of [...docKeys, ...tenderKeys, ...eftKeys]) {
              try {
                await storage.delete(key);
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore R2 errors
        }

        // Cascade counts — manual deletes for reporting, then rely on cascade for remainder
        const cascadeCounts: Record<string, number> = {};
        try {
          const allDocs = await db.select().from(complianceDocuments);
          const docsToDelete = allDocs.filter((d) =>
            companyIds.includes((d as unknown as { companyId: string }).companyId),
          );
          cascadeCounts.documents = docsToDelete.length;
          const allTenders = await db.select().from(tenders);
          const tendersToDelete = allTenders.filter((t) =>
            companyIds.includes((t as unknown as { companyId: string }).companyId),
          );
          cascadeCounts.tenders = tendersToDelete.length;
          const allReminders = await db.select().from(sentReminders);
          const remindersToDelete = allReminders.filter((r) =>
            companyIds.includes((r as unknown as { companyId: string }).companyId),
          );
          cascadeCounts.sent_reminders = remindersToDelete.length;
          const allEft = await db.select().from(eftPayments);
          const eftToDelete = allEft.filter(
            (p) =>
              (p as unknown as { userId: string }).userId === userId ||
              companyIds.includes((p as unknown as { companyId: string }).companyId),
          );
          cascadeCounts.manual_payments = eftToDelete.length;
          const allReferrals = await db.select().from(referrals);
          const refToDelete = allReferrals.filter(
            (r) =>
              (r as unknown as { referrerUserId: string }).referrerUserId === userId ||
              (r as unknown as { refereeUserId: string }).refereeUserId === userId,
          );
          cascadeCounts.referrals = refToDelete.length;
          const allRewards = await db.select().from(referralRewards);
          const rewardsToDelete = allRewards.filter(
            (rr) =>
              (rr as unknown as { referrerUserId: string }).referrerUserId === userId ||
              (rr as unknown as { refereeUserId: string }).refereeUserId === userId,
          );
          cascadeCounts.referral_rewards = rewardsToDelete.length;
        } catch {
          // ignore counts
        }
        cascadeCounts.companies = ownedCompanies.length;

        // Perform deletes — order: documents, tenders, reminders, credits, eft, referrals, rewards, companies, user
        // Use JS-filtered deletes via loop with eq where possible, fallback to delete all matching via filter.

        // Delete compliance docs
        for (const doc of await db.select().from(complianceDocuments)) {
          const did = (doc as unknown as { companyId: string }).companyId;
          if (companyIds.includes(did)) {
            try {
              await (
                db.delete(complianceDocuments).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(complianceDocuments.id, (doc as unknown as { id: string }).id));
            } catch {
              // ignore
            }
          }
        }
        // Delete tenders
        for (const t of await db.select().from(tenders)) {
          const cid = (t as unknown as { companyId: string }).companyId;
          if (companyIds.includes(cid)) {
            try {
              await (db.delete(tenders).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(tenders.id, (t as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete sent reminders
        for (const r of await db.select().from(sentReminders)) {
          const cid = (r as unknown as { companyId: string }).companyId;
          if (companyIds.includes(cid)) {
            try {
              await (db.delete(sentReminders).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(sentReminders.id, (r as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete company credits
        for (const cc of await db.select().from(companyCredits)) {
          const cid = (cc as unknown as { companyId: string }).companyId;
          if (companyIds.includes(cid)) {
            try {
              await (
                db.delete(companyCredits).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(companyCredits.companyId, cid));
            } catch {
              // ignore
            }
          }
        }
        // Delete eft payments
        for (const p of await db.select().from(eftPayments)) {
          const uid = (p as unknown as { userId: string }).userId;
          const cid = (p as unknown as { companyId: string }).companyId;
          if (uid === userId || companyIds.includes(cid)) {
            try {
              await (db.delete(eftPayments).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(eftPayments.id, (p as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete referrals
        for (const ref of await db.select().from(referrals)) {
          const rid = (ref as unknown as { referrerUserId: string }).referrerUserId;
          const fid = (ref as unknown as { refereeUserId: string }).refereeUserId;
          if (rid === userId || fid === userId) {
            try {
              await (db.delete(referrals).where as unknown as (c: unknown) => Promise<unknown>)(
                eq(referrals.id, (ref as unknown as { id: string }).id),
              );
            } catch {
              // ignore
            }
          }
        }
        // Delete referral rewards where referrer or referee matches, or company belongs to user
        for (const rr of await db.select().from(referralRewards)) {
          const rid = (rr as unknown as { referrerUserId: string }).referrerUserId;
          const fid = (rr as unknown as { refereeUserId: string }).refereeUserId;
          const cid = (rr as unknown as { referrerCompanyId: string }).referrerCompanyId;
          if (rid === userId || fid === userId || companyIds.includes(cid)) {
            try {
              await (
                db.delete(referralRewards).where as unknown as (c: unknown) => Promise<unknown>
              )(eq(referralRewards.id, (rr as unknown as { id: string }).id));
            } catch {
              // ignore
            }
          }
        }
        // Delete companies
        for (const c of ownedCompanies) {
          try {
            await (db.delete(companies).where as unknown as (cnd: unknown) => Promise<unknown>)(
              eq(companies.id, c.id),
            );
          } catch {
            // ignore
          }
        }
        // Finally delete user
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
