import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminStatsQuery } from "@/lib/queries";

export const Route = createFileRoute("/admin/")({
  component: AdminPage,
});

function AdminPage() {
  const statsQueryResult = useQuery(adminStatsQuery());
  const stats = statsQueryResult.data ?? null;
  const refreshing = statsQueryResult.isFetching;

  if (statsQueryResult.isPending || statsQueryResult.isError) {
    return (
      <div className="py-16 text-center" data-testid="admin-stats-state">
        {statsQueryResult.isError ? (
          <>
            <p className="text-sm text-red-300">Could not load admin statistics.</p>
            <Button
              type="button"
              variant="outline"
              data-testid="admin-stats-retry"
              onClick={() => void statsQueryResult.refetch()}
              className="mt-4 border-zinc-700 text-zinc-200 hover:bg-zinc-900"
            >
              Try again
            </Button>
          </>
        ) : (
          <span className="text-sm text-zinc-400">Loading statistics…</span>
        )}
      </div>
    );
  }

  const usersTotal = stats?.users?.total ?? 0;
  const adminsTotal = stats?.users?.admins ?? 0;
  const companiesTotal = stats?.companies?.total ?? 0;
  const eftPendingReview = stats?.eft?.pending_review ?? 0;
  const tendersTotal = stats?.tenders?.total ?? 0;
  const docsTotal = stats?.documents?.total ?? 0;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="admin-overview-title">
            Admin Console
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Centralised operations overview.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="admin-stats-refresh"
          onClick={() => void statsQueryResult.refetch()}
          disabled={refreshing}
          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCwIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          data-testid="admin-stat-users"
          className="rounded-sm border-zinc-800 bg-zinc-950 text-white shadow-none"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{usersTotal}</p>
            {eftPendingReview > 0 && (
              <p className="mt-1 text-xs text-zinc-400">
                {eftPendingReview} EFT payment{eftPendingReview === 1 ? "" : "s"} awaiting review
              </p>
            )}
          </CardContent>
        </Card>
        <Card
          data-testid="admin-stat-companies"
          className="rounded-sm border-zinc-800 bg-zinc-950 text-white shadow-none"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
              Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{companiesTotal}</p>
          </CardContent>
        </Card>
        <Card
          data-testid="admin-stat-eft"
          className="rounded-sm border-zinc-800 bg-zinc-950 text-white shadow-none"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
              EFT Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eftPendingReview}</p>
            {eftPendingReview > 0 && (
              <p className="mt-1 text-xs text-zinc-400">
                awaiting review — reconcile to grant credits
              </p>
            )}
          </CardContent>
        </Card>
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
        <Link
          to="/admin/users"
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
        </Link>
        <Link
          to="/admin/companies"
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
        </Link>
        <Link
          to="/admin/eft"
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
        </Link>
      </div>
    </>
  );
}
