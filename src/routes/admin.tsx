import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react";

import { AdminShell } from "@/components/admin-layout";
import { apiGet } from "@/lib/api-client";
import { qk } from "@/lib/api-client";
import { useAdminGuard } from "@/hooks/use-admin-guard";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface AdminStats {
  users?: { total?: number; admins?: number; new_30d?: number };
  companies?: { total?: number; new_30d?: number };
  tenders?: { total?: number; new_30d?: number };
  documents?: { total?: number; expiring_30d?: number };
  subscriptions?: { active?: number };
  eft?: { pending_review?: number };
}

function fetchAdminStats(): Promise<AdminStats> {
  return apiGet<AdminStats>("/api/admin/stats");
}

function AdminPage() {
  const { session, isPending } = useAdminGuard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const statsQueryResult = useQuery({
    queryKey: qk.adminStats,
    queryFn: fetchAdminStats,
    enabled: !isPending && session?.user?.role === "admin",
  });
  const stats = statsQueryResult.data ?? null;
  const refreshing = statsQueryResult.isFetching;

  if (isPending || !session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Loading…
        </span>
      </div>
    );
  }

  // When at a nested admin child (/admin/users etc.), render the child via Outlet.
  // The child pages already include their own AdminShell + guard, so we just outlet.
  if (pathname !== "/admin") {
    return <Outlet />;
  }

  const usersTotal = stats?.users?.total ?? 0;
  const adminsTotal = stats?.users?.admins ?? 0;
  const companiesTotal = stats?.companies?.total ?? 0;
  const eftPendingReview = stats?.eft?.pending_review ?? 0;
  const tendersTotal = stats?.tenders?.total ?? 0;
  const docsTotal = stats?.documents?.total ?? 0;

  return (
    <AdminShell active="overview">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="admin-overview-title">
            Admin Console
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Centralised operations overview.</p>
        </div>
        <button
          type="button"
          data-testid="admin-stats-refresh"
          onClick={() => void statsQueryResult.refetch()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          <RefreshCwIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          data-testid="admin-stat-users"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">Users</p>
          <p className="mt-2 text-2xl font-bold">{usersTotal}</p>
          {eftPendingReview > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              {eftPendingReview} EFT payment{eftPendingReview === 1 ? "" : "s"} awaiting review
            </p>
          )}
        </div>
        <div
          data-testid="admin-stat-companies"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            Companies
          </p>
          <p className="mt-2 text-2xl font-bold">{companiesTotal}</p>
        </div>
        <div
          data-testid="admin-stat-eft"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            EFT Payments
          </p>
          <p className="mt-2 text-2xl font-bold">{eftPendingReview}</p>
          {eftPendingReview > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              awaiting review — reconcile to grant credits
            </p>
          )}
        </div>
      </div>
      {/* Activity tiles */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          data-testid="admin-stat-tenders"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            Tenders analysed
          </p>
          <p className="mt-2 text-2xl font-bold">{tendersTotal}</p>
        </div>
        <div
          data-testid="admin-stat-docs"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            Documents on file
          </p>
          <p className="mt-2 text-2xl font-bold">{docsTotal}</p>
        </div>
        <div
          data-testid="admin-stat-admins"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">Admins</p>
          <p className="mt-2 text-2xl font-bold">{adminsTotal}</p>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <a
          href="/admin/users"
          data-testid="admin-quick-users"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-colors hover:border-teal-500/40"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
            User management
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-semibold">
            Manage users <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </p>
          <p className="mt-1 text-xs text-zinc-400">Impersonate and troubleshoot accounts.</p>
        </a>
        <a
          href="/admin/companies"
          data-testid="admin-quick-companies"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-colors hover:border-teal-500/40"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
            Company registry
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-semibold">
            Manage companies <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </p>
          <p className="mt-1 text-xs text-zinc-400">Inspect compliance posture at a glance.</p>
        </a>
        <a
          href="/admin/eft"
          data-testid="admin-quick-eft"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-colors hover:border-teal-500/40"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">EFT console</p>
          <p className="mt-2 flex items-center gap-1.5 font-semibold">
            Review payments <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Confirm credits and trigger referral rewards.
          </p>
        </a>
      </div>
    </AdminShell>
  );
}
