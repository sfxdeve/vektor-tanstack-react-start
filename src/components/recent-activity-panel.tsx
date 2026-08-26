import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, BanknoteIcon, FileTextIcon, GiftIcon, InboxIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActivityItem } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import { activityQuery } from "@/lib/queries";

const ACTIVITY_TABS = [
  { key: "all", label: "All", type: null },
  { key: "tender", label: "Tenders", type: "tender" },
  { key: "eft", label: "Payments", type: "eft" },
  { key: "referral_reward", label: "Referrals", type: "referral_reward" },
] as const;

const EMPTY_COPY_BY_TAB: Record<string, string> = {
  all: "Nothing to show yet. Analyse a tender or invite someone to Vektor to get started.",
  tender: "No tender analyses yet. Upload a tender PDF from the dashboard to see it here.",
  eft: "No payments yet. Top up credits or subscribe from the Billing page.",
  referral_reward:
    "No referral rewards yet. Share your referral code from Billing to earn credits.",
};

function timeAgo(iso: string): string {
  const diffS = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffS < 60) return "just now";
  const m = Math.floor(diffS / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

function currencyRand(n: number): string {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const VERDICT_BADGE_CLASS: Record<string, string> = {
  GO: "bg-green-100 text-green-800",
  CAUTION: "bg-amber-100 text-amber-800",
  "NO-GO": "bg-red-100 text-red-800",
};

const EFT_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  awaiting_proof: { label: "Awaiting proof", badgeClass: "bg-amber-100 text-amber-800" },
  pending_review: { label: "Awaiting review", badgeClass: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", badgeClass: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", badgeClass: "bg-red-100 text-red-800" },
};

function ActivityRowShell({
  testId,
  icon,
  onOpen,
  title,
  badge,
  subtitle,
}: {
  testId: string;
  icon: React.ReactNode;
  onOpen: () => void;
  title: React.ReactNode;
  badge?: React.ReactNode;
  subtitle: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-900">{title}</p>
          {badge}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
    </button>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const navigate = useNavigate();
  if (item.type === "tender") {
    const verdict = item.verdict || "UNKNOWN";
    return (
      <ActivityRowShell
        testId={`activity-item-tender-${item.id}`}
        icon={<FileTextIcon className="h-4 w-4" aria-hidden="true" />}
        onOpen={() => void navigate({ to: "/analyze" })}
        title={item.title}
        badge={
          <Badge
            className={`rounded-sm ${VERDICT_BADGE_CLASS[verdict] ?? "bg-zinc-100 text-zinc-800"}`}
          >
            {verdict}
            {typeof item.fit_score === "number" && (
              <span className="opacity-70">· {item.fit_score}%</span>
            )}
          </Badge>
        }
        subtitle={`${item.issuing_entity ? `${item.issuing_entity} · ` : ""}Tender analysis · ${timeAgo(item.created_at)}`}
      />
    );
  }
  if (item.type === "eft") {
    const meta = EFT_STATUS_META[item.status] ?? {
      label: item.status,
      badgeClass: "bg-zinc-100 text-zinc-800",
    };
    return (
      <ActivityRowShell
        testId={`activity-item-eft-${item.id}`}
        icon={<BanknoteIcon className="h-4 w-4" aria-hidden="true" />}
        onOpen={() => void navigate({ to: "/billing" })}
        title={`${item.plan_name} · ${currencyRand(item.amount)}`}
        badge={<Badge className={`rounded-sm ${meta.badgeClass}`}>{meta.label}</Badge>}
        subtitle={
          <span className="font-mono">
            {item.reference} · EFT payment · {timeAgo(item.created_at)}
          </span>
        }
      />
    );
  }
  return (
    <ActivityRowShell
      testId={`activity-item-referral-${item.id}`}
      icon={<GiftIcon className="h-4 w-4" aria-hidden="true" />}
      onOpen={() => void navigate({ to: "/billing" })}
      title={
        item.type === "referral_reward"
          ? `Referral reward · +${item.credits_granted} credit${item.credits_granted === 1 ? "" : "s"}`
          : "Referral reward"
      }
      badge={<Badge className="rounded-sm bg-teal-100 text-teal-800">Earned</Badge>}
      subtitle={
        item.type === "referral_reward"
          ? `Someone you invited paid for a subscription · ${timeAgo(item.created_at)}`
          : null
      }
    />
  );
}

/**
 * Unified feed of tender analyses, EFT payments and referral rewards with
 * per-type filter tabs. Data comes from /api/dashboard/activity via TanStack
 * Query; each tab refetches so a busy stream never starves another.
 */
export function RecentActivityPanel({ limit = 8 }: { limit?: number }) {
  const [activeTabKey, setActiveTabKey] = useState<string>("all");
  const activeTab = ACTIVITY_TABS.find((t) => t.key === activeTabKey) ?? ACTIVITY_TABS[0];
  const { data, isPending, isError } = useQuery(activityQuery(activeTab.type ?? null, limit));
  const items = data?.items ?? [];

  return (
    <Card
      className="mb-8 rounded-sm border-zinc-200 shadow-none"
      data-testid="recent-activity-panel"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-zinc-200">
        <CardTitle className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          Recent Activity
        </CardTitle>
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
          Last {limit}
        </span>
      </CardHeader>

      <Tabs value={activeTabKey} onValueChange={setActiveTabKey}>
        <TabsList
          aria-label="Activity filter"
          className="flex h-auto w-full items-center justify-start gap-1 overflow-x-auto rounded-none border-b border-zinc-200 bg-zinc-50/60 p-2"
          data-testid="activity-filter-tabs"
        >
          {ACTIVITY_TABS.map((tab) => {
            const isActive = activeTabKey === tab.key;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                data-testid={`activity-tab-${tab.key}`}
                className={`flex-none whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] data-active:bg-zinc-900 data-active:text-white ${
                  isActive
                    ? "bg-zinc-900 text-white hover:bg-zinc-900 hover:text-white"
                    : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <CardContent className="p-0">
        {isPending ? (
          <div className="space-y-3 p-5 sm:p-6" data-testid="activity-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-sm" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-sm text-red-600 sm:p-8" data-testid="activity-error">
            Could not load activity.
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center sm:p-8" data-testid="activity-empty">
            <p className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-100 text-zinc-400">
              <InboxIcon className="h-5 w-5" aria-hidden="true" />
            </p>
            <p className="text-sm text-zinc-600">
              {EMPTY_COPY_BY_TAB[activeTabKey] ?? EMPTY_COPY_BY_TAB.all}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {items.map((it) => (
              <ActivityRow key={`${it.type}-${it.id}`} item={it} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
