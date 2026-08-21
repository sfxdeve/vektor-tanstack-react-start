// oxlint-disable react/set-state-in-effect
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";

import { useAdminGuard } from "@/hooks/use-admin-guard";
import { AdminShell } from "@/components/admin-layout";

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

function AdminPage() {
  const { session, isPending } = useAdminGuard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/admin/stats");
      if (r.ok) {
        setStats((await r.json()) as AdminStats);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && session?.user?.role === "admin") {
      void fetchStats();
    }
  }, [isPending, session, fetchStats]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="text-sm font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Loading…
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

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
          onClick={() => void fetchStats()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
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
            <p className="mt-1 text-xs text-zinc-400">{eftPendingReview} pending EFT · quick ops</p>
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
          <p className="mt-2 text-2xl font-bold">{usersTotal}</p>
        </div>
      </div>
      {/* additional tiles to mirror old overview and provide richer test coverage */}
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
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 hover:border-zinc-700"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
            User management
          </p>
          <p className="mt-2 font-semibold">Manage users →</p>
          <p className="mt-1 text-xs text-zinc-400">Impersonate and troubleshoot accounts.</p>
        </a>
        <a
          href="/admin/companies"
          data-testid="admin-quick-companies"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 hover:border-zinc-700"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
            Company registry
          </p>
          <p className="mt-2 font-semibold">Manage companies →</p>
          <p className="mt-1 text-xs text-zinc-400">Inspect compliance posture at a glance.</p>
        </a>
        <a
          href="/admin/eft"
          data-testid="admin-quick-eft"
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 hover:border-zinc-700"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">EFT console</p>
          <p className="mt-2 font-semibold">Review payments →</p>
          <p className="mt-1 text-xs text-zinc-400">
            Confirm credits and trigger referral rewards.
          </p>
        </a>
      </div>
    </AdminShell>
  );
}
