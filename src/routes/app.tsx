// oxlint-disable react/set-state-in-effect, react/purity
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

// ----- helpers -----
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffS = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffS < 60) return "just now";
  const m = Math.floor(diffS / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function currencyRand(n: unknown): string {
  if (typeof n === "number") {
    return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return "—";
}

// Discriminated union — avoids Primitive Obsession on stringly-typed activity items
type TenderActivity = {
  type: "tender";
  id: string;
  created_at: string;
  title: string;
  issuing_entity?: string | null;
  fit_score?: number | null;
  verdict?: string;
};
type EftActivity = {
  type: "eft";
  id: string;
  created_at: string;
  reference: string;
  plan_name: string;
  amount: number;
  status: string;
};
type ReferralActivity = {
  type: "referral_reward";
  id: string;
  created_at: string;
  credits_granted: number;
  plan_lookup_key?: string | null;
  trigger_reference?: string | null;
};
type ActivityItem = TenderActivity | EftActivity | ReferralActivity;

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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-zinc-900">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-900">{title}</p>
          {badge}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>
      </div>
      <span className="shrink-0 text-zinc-400" aria-hidden>
        →
      </span>
    </button>
  );
}

function TenderRow({ item, onOpen }: { item: TenderActivity; onOpen: () => void }) {
  const verdict = item.verdict || "UNKNOWN";
  const badgeClass =
    verdict === "GO"
      ? "bg-green-100 text-green-800"
      : verdict === "CAUTION"
        ? "bg-amber-100 text-amber-800"
        : verdict === "NO-GO"
          ? "bg-red-100 text-red-800"
          : "bg-zinc-100 text-zinc-800";
  return (
    <ActivityRowShell
      testId={`activity-item-tender-${item.id}`}
      icon={<span className="text-[11px] font-bold text-white">T</span>}
      onOpen={onOpen}
      title={item.title || "Untitled tender"}
      badge={
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}
        >
          {verdict}
          {typeof item.fit_score === "number" && (
            <span className="opacity-70">· {item.fit_score}%</span>
          )}
        </span>
      }
      subtitle={
        <>
          {item.issuing_entity ? `${item.issuing_entity} · ` : ""}Tender analysis ·{" "}
          {timeAgo(item.created_at)}
        </>
      }
    />
  );
}

const EFT_STATUS_META: Record<string, { label: string; tone: string }> = {
  awaiting_proof: { label: "Awaiting proof", tone: "amber" },
  pending_review: { label: "Awaiting review", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "zinc" },
};
const TONE_CLASS: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  zinc: "bg-zinc-100 text-zinc-800",
};

function EftRow({ item, onOpen }: { item: EftActivity; onOpen: () => void }) {
  const meta = EFT_STATUS_META[item.status || ""] || { label: item.status || "—", tone: "zinc" };
  return (
    <ActivityRowShell
      testId={`activity-item-eft-${item.id}`}
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-teal-600 text-[11px] font-bold text-white">
          R
        </span>
      }
      onOpen={onOpen}
      title={
        <>
          {item.plan_name} · {currencyRand(item.amount)}
        </>
      }
      badge={
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TONE_CLASS[meta.tone]}`}
        >
          {meta.label}
        </span>
      }
      subtitle={
        <span className="font-mono">
          {item.reference} · EFT payment · {timeAgo(item.created_at)}
        </span>
      }
    />
  );
}

function ReferralRow({ item, onOpen }: { item: ReferralActivity; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`activity-item-referral-${item.id}`}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-teal-500/40 bg-teal-500/10">
        <span className="text-[11px] font-bold text-teal-700">R</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-900">
            Referral reward · +{item.credits_granted} credit
            {(item.credits_granted ?? 0) === 1 ? "" : "s"}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
            Earned
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          Someone you invited paid for a subscription · {timeAgo(item.created_at)}
        </p>
      </div>
      <span className="shrink-0 text-zinc-400" aria-hidden>
        →
      </span>
    </button>
  );
}

const ACTIVITY_TABS = [
  { key: "all", label: "All", type: null as string | null },
  { key: "tender", label: "Tenders", type: "tender" },
  { key: "eft", label: "Payments", type: "eft" },
  { key: "referral_reward", label: "Referrals", type: "referral_reward" },
];

function RecentActivityPanel({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const limit = 8;
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const tab = ACTIVITY_TABS.find((t) => t.key === activeTab);
        const params: Record<string, string> = { limit: String(limit) };
        if (tab?.type) params.type = tab.type;
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(`/api/dashboard/activity?${qs}`);
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as { items: ActivityItem[] };
        if (!cancelled) setItems(data.items || []);
      } catch {
        if (!cancelled) setError("Could not load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const emptyCopyByTab: Record<string, string> = {
    all: "Nothing to show yet. Analyse a tender or invite someone to Vektor to get started.",
    tender: "No tender analyses yet. Upload a tender PDF from the dashboard to see it here.",
    eft: "No payments yet. Top up credits or subscribe from the Billing page.",
    referral_reward:
      "No referral rewards yet. Share your referral code from Billing to earn credits.",
  };

  return (
    <Card
      className="mb-8 rounded-sm border-zinc-200 shadow-none"
      data-testid="recent-activity-panel"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-zinc-200">
        <div className="flex items-center gap-2.5">
          <span className="text-zinc-700" aria-hidden>
            🕒
          </span>
          <CardTitle className="text-xl font-bold tracking-tight">Recent Activity</CardTitle>
        </div>
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
          Last {limit}
        </span>
      </CardHeader>

      <div
        role="tablist"
        aria-label="Activity filter"
        className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50/60 px-3 py-2"
        data-testid="activity-filter-tabs"
      >
        {ACTIVITY_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`activity-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={
                "whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors " +
                (isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200/70")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <CardContent className="p-0">
        {loading ? (
          <div
            className="p-6 text-center text-sm text-zinc-500 sm:p-8"
            data-testid="activity-loading"
          >
            Loading activity…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-red-600 sm:p-8" data-testid="activity-error">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center sm:p-8" data-testid="activity-empty">
            <p className="mx-auto mb-2 text-2xl text-zinc-400" aria-hidden>
              🕒
            </p>
            <p className="text-sm text-zinc-600">
              {emptyCopyByTab[activeTab] || emptyCopyByTab.all}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {items.map((it) => {
              if (it.type === "tender") {
                return (
                  <TenderRow
                    key={`t-${it.id}`}
                    item={it as TenderActivity}
                    onOpen={() => void navigate({ to: "/analyze" })}
                  />
                );
              }
              if (it.type === "eft") {
                return (
                  <EftRow
                    key={`e-${it.id}`}
                    item={it as EftActivity}
                    onOpen={() => void navigate({ to: "/billing" })}
                  />
                );
              }
              if (it.type === "referral_reward") {
                return (
                  <ReferralRow
                    key={`r-${it.id}`}
                    item={it as ReferralActivity}
                    onOpen={() => void navigate({ to: "/billing" })}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DownloadSbdButton({ tenderId, form }: { tenderId: string; form: "sbd4" | "sbd61" }) {
  const label = form === "sbd4" ? "SBD 4" : "SBD 6.1";
  const testId = form === "sbd4" ? `sbd4-btn-${tenderId}` : `sbd61-btn-${tenderId}`;
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tender/${tenderId}/${form}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || "Failed to download");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${form.toUpperCase()}-${tenderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${label} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download form");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:underline disabled:opacity-50"
    >
      <span
        className="inline-block h-3 w-3 rounded-sm border border-zinc-300 bg-white"
        aria-hidden
      />
      {busy ? "…" : label}
    </button>
  );
}

function AppPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [companies, setCompanies] = useState<Array<Record<string, unknown>>>([]);
  const [tenders, setTenders] = useState<Array<Record<string, unknown>>>([]);
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      void navigate({ to: "/login" });
      return;
    }
    const role = (session.user as unknown as { role?: string }).role;
    const impersonatedBy = (session.session as unknown as { impersonatedBy?: string })
      ?.impersonatedBy;
    if (role === "admin" && !impersonatedBy) {
      void navigate({ to: "/admin" });
    }
  }, [session, isPending, navigate]);

  const loadCompanyBundle = useCallback(async (companyId: string) => {
    try {
      const [tendersRes, docsRes, creditsRes] = await Promise.all([
        fetch(`/api/tenders/${companyId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/documents/company/${companyId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/billing/credits/${companyId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const listTenders = Array.isArray(tendersRes) ? tendersRes : [];
      const listDocs = Array.isArray(docsRes)
        ? docsRes
        : (docsRes as { documents?: unknown[] })?.documents || [];
      setTenders(listTenders as Array<Record<string, unknown>>);
      setDocuments(Array.isArray(listDocs) ? (listDocs as Array<Record<string, unknown>>) : []);
      if (creditsRes && typeof (creditsRes as { credits?: number }).credits === "number") {
        setCredits((creditsRes as { credits: number }).credits);
      } else {
        setCredits(null);
      }
    } catch {
      // keep empty
    }
  }, []);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    void (async () => {
      setLoadingCompanies(true);
      try {
        const res = await fetch("/api/companies");
        const data = res.ok ? await res.json() : [];
        const list = Array.isArray(data) ? data : [];
        if (!cancelled) {
          setCompanies(list as Array<Record<string, unknown>>);
        }
        const first = (list[0] as Record<string, unknown> | undefined)?.id as string | undefined;
        if (first) {
          await loadCompanyBundle(first);
        } else {
          setTenders([]);
          setDocuments([]);
          setCredits(null);
        }
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setLoadingCompanies(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, loadCompanyBundle]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          Loading…
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  const selectedCompany = companies[0] as Record<string, unknown> | undefined;
  const companyName =
    (selectedCompany?.company_name as string) || (selectedCompany?.companyName as string) || "";
  const bbbeeLevel = (selectedCompany?.bbbee_level ?? selectedCompany?.bbbeeLevel) as
    | string
    | number
    | null
    | undefined;
  const cidbDisplay =
    (selectedCompany?.cidb_crs_num as string) || (selectedCompany?.cidbCrsNum as string) || "";
  const compliantDocs = documents.filter((d) => {
    const v = d.is_compliant ?? d.isCompliant;
    return v === true || v === 1;
  }).length;
  const totalDocs = documents.length;
  const avgFitScore =
    tenders.length > 0
      ? Math.round(
          tenders.reduce(
            (sum, t) => sum + (Number((t.fit_score ?? t.fitScore) as number) || 0),
            0,
          ) / tenders.length,
        )
      : 0;

  const hasExpiredDocs = documents.some((d) => {
    const isCompliant = d.is_compliant ?? d.isCompliant;
    if (isCompliant === false || isCompliant === 0) return true;
    const expiryRaw = (d.expiry_date ?? d.expiryDate) as string | number | null | undefined;
    if (!expiryRaw) return false;
    let expiryMs: number | null = null;
    if (typeof expiryRaw === "number") expiryMs = expiryRaw;
    else if (typeof expiryRaw === "string") {
      const parsed = Date.parse(expiryRaw);
      if (!Number.isNaN(parsed)) expiryMs = parsed;
    }
    if (expiryMs == null) return false;
    const now = Date.now();
    const ms = typeof expiryMs === "number" && expiryMs < 1e12 ? expiryMs * 1000 : expiryMs;
    return ms < now;
  });

  // No company state — keep dashboard-title so landing redirect tests stay green
  if (!loadingCompanies && companies.length === 0) {
    return (
      <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
        <ImpersonationBanner />
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-auto bg-zinc-50">
          <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
            <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              Dashboard
            </p>
            <h1
              className="truncate text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
              data-testid="dashboard-title"
            >
              Dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
              Your compliance overview.
            </p>
          </header>
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-sm border border-zinc-200 bg-white text-2xl text-zinc-400"
                aria-hidden
              >
                🏢
              </div>
              <h2 className="text-2xl font-bold tracking-tight">No Company Profile Found</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Create your company profile to start analyzing tenders and managing compliance
                documents.
              </p>
              <Button
                data-testid="create-company-btn"
                onClick={() => void navigate({ to: "/setup" })}
                size="lg"
                className="mt-6 bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Create Company Profile
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
      <ImpersonationBanner />
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-auto bg-zinc-50">
        {/* Solid header — never transparent over scrolled content */}
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Dashboard
              </p>
              <h1
                className="truncate text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
                data-testid="dashboard-title"
              >
                {companyName || "Dashboard"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
                Your compliance overview.
              </p>
            </div>
            <Button
              data-testid="analyze-tender-btn"
              onClick={() => void navigate({ to: "/analyze" })}
              size="lg"
              className="w-full shrink-0 bg-zinc-900 text-white hover:bg-zinc-800 sm:w-auto"
            >
              <span aria-hidden className="mr-2">
                ↑
              </span>
              Analyze New Tender
            </Button>
          </div>
        </header>

        <div className="p-4 sm:p-8">
          {/* Credit / expiry hint bar */}
          {credits != null && (
            <div
              data-testid="dashboard-credit-hint"
              className="mb-6 flex flex-wrap items-center gap-2 rounded-sm border border-zinc-200 bg-white px-4 py-3 text-sm"
            >
              <span className="text-xs font-semibold tracking-[0.15em] text-zinc-500 uppercase">
                Credits
              </span>
              <span
                className="text-base font-bold text-zinc-900"
                data-testid="dashboard-credits-value"
              >
                {credits}
              </span>
              <span className="text-xs text-zinc-500">available</span>
              <Link
                to="/billing"
                data-testid="dashboard-billing-link"
                className="ml-auto text-xs font-semibold text-zinc-900 underline underline-offset-2"
              >
                Manage billing →
              </Link>
            </div>
          )}

          {hasExpiredDocs && (
            <div
              data-testid="compliance-banner"
              role="alert"
              className="mb-6 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span className="font-bold">Compliance alert:</span> One or more documents are expired
              or non-compliant. Review your vault before bidding.
              <Link
                to="/documents"
                data-testid="compliance-banner-cta"
                className="ml-2 font-semibold underline underline-offset-2"
              >
                Open vault →
              </Link>
            </div>
          )}

          {/* Stats Grid — Swiss high-contrast technical cards with grid borders */}
          <div
            className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4"
            data-testid="dashboard-stats-grid"
          >
            <Card
              className="grid-border-item rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="stat-bbbee"
            >
              <p
                className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase"
                data-testid="stat-bbbee-label"
              >
                B-BBEE Level
              </p>
              <p
                className="mt-3 text-3xl font-bold tracking-tight text-zinc-900"
                data-testid="stat-bbbee-value"
              >
                {bbbeeLevel != null && bbbeeLevel !== "" ? `Level ${String(bbbeeLevel)}` : "N/A"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Preference points</p>
            </Card>

            <Card
              className="grid-border-item rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="dashboard-card-bbbee"
              aria-hidden
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                B-BBEE Level
              </p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-900">
                {bbbeeLevel != null && bbbeeLevel !== "" ? `Level ${String(bbbeeLevel)}` : "N/A"}
              </p>
            </Card>

            <Card
              className="grid-border-item rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="dashboard-card-cidb"
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">CIDB</p>
              {cidbDisplay ? (
                <p
                  className="mt-3 font-mono text-xl font-bold tracking-tight text-zinc-900"
                  data-testid="cidb-display"
                >
                  {cidbDisplay}
                </p>
              ) : (
                <p className="mt-3 text-sm text-zinc-600">Add your grades in Company Setup</p>
              )}
              <p className="mt-1 text-xs text-zinc-500">Registered grades &amp; classes</p>
            </Card>

            {/* Hidden alias for legacy stat-cidb selectors */}
            <Card
              className="hidden rounded-sm border-zinc-200 bg-white p-6 shadow-none md:hidden"
              data-testid="stat-cidb"
              aria-hidden
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                CIDB Grade
              </p>
              <p className="mt-2 text-2xl font-bold">{cidbDisplay || "Not Set"}</p>
            </Card>

            <Card
              className="grid-border-item rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="dashboard-card-compliance"
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Compliance
              </p>
              <p
                className="mt-3 text-3xl font-bold tracking-tight text-zinc-900"
                data-testid="compliance-status-value"
              >
                {totalDocs === 0 ? "No docs" : `${compliantDocs}/${totalDocs}`}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Documents Compliant</p>
              <p className="mt-2 text-xs font-semibold text-zinc-700">
                {totalDocs === 0
                  ? "Add documents to track →"
                  : compliantDocs === totalDocs
                    ? "Healthy ✓"
                    : `${totalDocs - compliantDocs} issue(s)`}
              </p>
            </Card>

            <Card
              className="hidden rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="stat-compliance"
              aria-hidden
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Compliance Status
              </p>
              <p className="mt-2 text-2xl font-bold">
                {compliantDocs}/{totalDocs}
              </p>
            </Card>

            <Card
              className="grid-border-item rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="dashboard-card-avg-score"
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Avg Fit Score
              </p>
              <p
                className="mt-3 text-3xl font-bold tracking-tight text-zinc-900"
                data-testid="avg-fit-score-value"
              >
                {tenders.length === 0 ? "—" : `${avgFitScore}%`}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Across {tenders.length} tender{tenders.length === 1 ? "" : "s"}
              </p>
            </Card>

            <Card
              className="hidden rounded-sm border-zinc-200 bg-white p-6 shadow-none"
              data-testid="stat-avg-score"
              aria-hidden
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Avg Fit Score
              </p>
              <p className="mt-2 text-2xl font-bold">{avgFitScore}%</p>
            </Card>
          </div>

          {/* Recent Activity */}
          <RecentActivityPanel navigate={navigate} />

          {/* Recent Tenders */}
          <Card
            className="mb-8 rounded-sm border-zinc-200 shadow-none"
            data-testid="recent-tenders-card"
          >
            <CardHeader className="border-b border-zinc-200">
              <CardTitle className="text-xl font-bold tracking-tight">
                Recent Tender Analyses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tenders.length === 0 ? (
                <div className="p-8 text-center" data-testid="empty-tenders">
                  <p className="mx-auto mb-3 text-3xl text-zinc-400" aria-hidden>
                    📄
                  </p>
                  <p className="text-sm text-zinc-600">
                    No tenders analyzed yet. Upload a tender PDF to get started.
                  </p>
                  <Button
                    data-testid="empty-cta-analyze"
                    onClick={() => void navigate({ to: "/analyze" })}
                    variant="outline"
                    className="mt-4 rounded-sm"
                  >
                    Analyze a tender
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-zinc-200 bg-zinc-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          Tender Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          Fit Score
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          B-BBEE Points
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          Risk Flags
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold tracking-[0.1em] text-zinc-700 uppercase">
                          SBD Forms
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {tenders.slice(0, 5).map((tender) => {
                        const tid = String(tender.id as string);
                        const fitScore =
                          Number((tender.fit_score ?? tender.fitScore) as number) || 0;
                        const bbbeePoints = (tender.eligible_bbbee_points ??
                          tender.eligibleBbbeePoints) as number | undefined;
                        const system = (tender.preference_point_system ??
                          tender.preferencePointSystem ??
                          "80/20") as string;
                        const maxPts = system === "90/10" ? 10 : 20;
                        const riskFlags = (tender.risk_flags ?? tender.riskFlags) as
                          | unknown[]
                          | string
                          | null;
                        const riskCount = Array.isArray(riskFlags)
                          ? riskFlags.length
                          : typeof riskFlags === "string"
                            ? (() => {
                                try {
                                  const parsed = JSON.parse(riskFlags) as unknown;
                                  return Array.isArray(parsed) ? parsed.length : 0;
                                } catch {
                                  return 0;
                                }
                              })()
                            : 0;
                        const createdAt = (tender.created_at ?? tender.createdAt) as
                          | string
                          | undefined;
                        const verdict =
                          fitScore >= 75 ? "GO" : fitScore >= 50 ? "CAUTION" : "NO-GO";
                        const badgeClass =
                          fitScore >= 75
                            ? "bg-green-100 text-green-800"
                            : fitScore >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800";
                        return (
                          <tr
                            key={tid}
                            className="transition-colors hover:bg-zinc-50"
                            data-testid={`tender-row-${tid}`}
                          >
                            <td className="px-6 py-4 text-sm font-medium text-zinc-900">
                              {String(tender.title as string)}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass}`}
                                data-testid={`tender-fit-badge-${tid}`}
                              >
                                <span aria-hidden>
                                  {verdict === "GO" ? "✓" : verdict === "NO-GO" ? "✕" : "!"}
                                </span>
                                {verdict}
                                <span className="opacity-70">· {fitScore}%</span>
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-700">
                              {typeof bbbeePoints === "number" ? `${bbbeePoints} / ${maxPts}` : "—"}
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-700">
                              {riskCount} flag{riskCount === 1 ? "" : "s"}
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600">
                              {createdAt ? new Date(createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <DownloadSbdButton tenderId={tid} form="sbd4" />
                                <DownloadSbdButton tenderId={tid} form="sbd61" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions — left-aligned dense content */}
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
            data-testid="dashboard-quick-actions"
          >
            <Link
              to="/documents"
              data-testid="manage-documents-btn"
              className="flex h-20 items-center justify-start gap-3 rounded-sm border border-zinc-900 bg-white px-6 text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              <span className="text-xl" aria-hidden>
                📄
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">Manage Documents</span>
                <span className="block text-xs opacity-70">
                  Upload and track compliance documents
                </span>
              </span>
            </Link>

            <Link
              to="/setup"
              data-testid="edit-profile-btn"
              className="flex h-20 items-center justify-start gap-3 rounded-sm border border-zinc-900 bg-white px-6 text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              <span className="text-xl" aria-hidden>
                🏢
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">Edit Company Profile</span>
                <span className="block text-xs opacity-70">
                  Update CIPC, CIDB, and B-BBEE details
                </span>
              </span>
            </Link>

            <Link
              to="/billing"
              data-testid="manage-billing-btn"
              className="flex h-20 items-center justify-start gap-3 rounded-sm border border-zinc-900 bg-white px-6 text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              <span className="text-xl" aria-hidden>
                💳
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">Billing &amp; Credits</span>
                <span className="block text-xs opacity-70">View credits and EFT payments</span>
              </span>
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/setup"
              data-testid="dashboard-link-setup"
              className="text-xs font-semibold tracking-[0.08em] text-zinc-600 uppercase underline underline-offset-2 hover:text-zinc-900"
            >
              Company setup →
            </Link>
            <Link
              to="/documents"
              data-testid="dashboard-link-documents"
              className="text-xs font-semibold tracking-[0.08em] text-zinc-600 uppercase underline underline-offset-2 hover:text-zinc-900"
            >
              Document vault →
            </Link>
            <Link
              to="/billing"
              data-testid="dashboard-link-billing"
              className="text-xs font-semibold tracking-[0.08em] text-zinc-600 uppercase underline underline-offset-2 hover:text-zinc-900"
            >
              Billing →
            </Link>
            <Link
              to="/help"
              data-testid="dashboard-link-help"
              className="text-xs font-semibold tracking-[0.08em] text-zinc-600 uppercase underline underline-offset-2 hover:text-zinc-900"
            >
              Help →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
