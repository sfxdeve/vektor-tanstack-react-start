// oxlint-disable react/set-state-in-effect, jsx-a11y/control-has-associated-label
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin-layout";
import { useAdminGuard } from "@/hooks/use-admin-guard";
import { authClient } from "@/lib/auth/auth-client";
import { getUserRole } from "@/lib/admin";

export const Route = createFileRoute("/admin/companies")({
  component: AdminCompaniesPage,
});

type CompanyRow = {
  id: string;
  company_name: string;
  cipc_num: string;
  owner_email: string | null;
  owner_name: string | null;
  user_id: string;
  credits: number;
  doc_count: number;
  expired_doc_count: number;
  tender_count: number;
  created_at: string;
};

type CompanyDetail = {
  company: {
    id: string;
    company_name: string;
    cipc_num: string;
    user_id: string;
    bbbee_level: number | null;
    cidb_crs_num: string | null;
    created_at: string;
  };
  docs: Array<{
    id: string;
    doc_type: string;
    file_name: string;
    is_compliant: boolean;
    expiry_date: string | null;
    storage_key: string | null;
  }>;
  tenders: Array<{ id: string; title: string; fit_score: number; created_at: string }>;
  credits: number;
  reminders: Array<{ id: string; threshold: number; sent_at: string }>;
  eft: Array<{ id: string; reference: string; status: string }>;
  compliance: { total: number; expired: number; compliant: number };
};

function AdminCompaniesPage() {
  const { session, isPending } = useAdminGuard();
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CompanyRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const fetchCompanies = useCallback(async (q?: string) => {
    setRefreshing(true);
    try {
      const url = q ? `/api/admin/companies?q=${encodeURIComponent(q)}` : "/api/admin/companies";
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed to load companies");
      const data = (await r.json()) as CompanyRow[];
      setCompanies(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load companies");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && session?.user && getUserRole(session as never) === "admin") {
      void fetchCompanies();
    }
  }, [isPending, session, fetchCompanies]);

  const filtered = useMemo(() => {
    if (!companies) return null;
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        c.cipc_num.toLowerCase().includes(q) ||
        (c.owner_email || "").toLowerCase().includes(q) ||
        (c.owner_name || "").toLowerCase().includes(q),
    );
  }, [companies, search]);

  const openDetail = async (row: CompanyRow) => {
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const r = await fetch(`/api/admin/companies/${row.id}`);
      if (!r.ok) throw new Error("Failed to load company detail");
      const data = (await r.json()) as CompanyDetail;
      setSelectedDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/admin/companies/${pendingDelete.id}`, { method: "DELETE" });
      const body = (await r.json().catch(() => null)) as {
        detail?: string;
        cascaded?: unknown;
      } | null;
      if (!r.ok) {
        toast.error(body?.detail || "Delete failed");
        return;
      }
      toast.success(`Deleted "${pendingDelete.company_name}"`, {
        description: `Cascaded: ${JSON.stringify(body?.cascaded ?? {})}`,
      });
      setCompanies((prev) => (prev ? prev.filter((x) => x.id !== pendingDelete.id) : prev));
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async (row: CompanyRow) => {
    if (!row.user_id) {
      toast.error("This company has no owner to impersonate");
      return;
    }
    setImpersonatingId(row.id);
    try {
      await (
        authClient as unknown as {
          admin: { impersonateUser: (a: { userId: string }) => Promise<unknown> };
        }
      ).admin.impersonateUser({ userId: row.user_id });
      toast.success(`Impersonating ${row.owner_email || "user"}`);
      window.location.href = "/app";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpersonatingId(null);
    }
  };

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

  return (
    <AdminShell active="companies">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">Companies</p>
            <h1
              className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl"
              data-testid="admin-companies-title"
            >
              Company registry
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
              Read every tenant&apos;s compliance posture at a glance. Delete abandoned accounts or
              inspect documents, tenders, credits and reminders.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchCompanies(search || undefined)}
            disabled={refreshing}
            data-testid="admin-refresh-btn"
            className="inline-flex items-center gap-2 self-start rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-zinc-400" data-testid="admin-companies-count">
            {filtered ? `${filtered.length} companies` : "—"}
          </span>
          <input
            type="search"
            placeholder="Search by company, CIPC, or owner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="admin-companies-search"
            // alias for legacy selector
            aria-label="Search companies"
            className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none sm:w-80"
          />
        </div>

        <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900">
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  <th className="px-6 py-3 font-semibold">Company</th>
                  <th className="px-6 py-3 font-semibold">Owner</th>
                  <th className="px-6 py-3 font-semibold">Docs</th>
                  <th className="px-6 py-3 font-semibold">Tenders</th>
                  <th className="px-6 py-3 font-semibold">Credits</th>
                  <th className="px-6 py-3 font-semibold">Created</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {companies === null && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-zinc-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {companies !== null && filtered && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-zinc-400"
                      data-testid="admin-companies-empty"
                    >
                      No companies yet.
                    </td>
                  </tr>
                )}
                {filtered &&
                  filtered.map((r) => (
                    <tr key={r.id} data-testid={`admin-row-${r.id}`} className="hover:bg-zinc-900">
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => void openDetail(r)}
                          data-testid={`admin-company-open-${r.id}`}
                          className="text-left"
                        >
                          <p className="font-semibold text-white">{r.company_name}</p>
                          <p className="text-xs text-zinc-400">{r.cipc_num}</p>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-semibold text-white">{r.owner_email || "—"}</p>
                        {r.owner_name && <p className="text-xs text-zinc-400">{r.owner_name}</p>}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">
                        {r.doc_count}{" "}
                        {r.expired_doc_count > 0 && (
                          <span className="ml-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                            {r.expired_doc_count} expired
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">{r.tender_count}</td>
                      <td className="px-6 py-4 text-zinc-300">{r.credits}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400">
                        {new Date(r.created_at).toLocaleDateString("en-ZA")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`admin-impersonate-${r.id}`}
                            onClick={() => void handleImpersonate(r)}
                            disabled={impersonatingId === r.id || !r.user_id}
                            className="rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                          >
                            {impersonatingId === r.id ? "…" : "Impersonate"}
                          </button>
                          <button
                            type="button"
                            data-testid={`admin-delete-${r.id}`}
                            // alias for older suite expecting admin-company-delete-*
                            onClick={() => setPendingDelete(r)}
                            className="rounded-sm border border-red-900/40 bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/40"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {detailLoading && (
          <div
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400"
            data-testid="admin-company-detail-loading"
          >
            Loading company detail…
          </div>
        )}
        {selectedDetail && (
          <div
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
            data-testid={`admin-company-detail-${selectedDetail.company.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white">
                  {selectedDetail.company.company_name}
                </h2>
                <p className="text-xs text-zinc-400">
                  {selectedDetail.company.cipc_num} · B-BBEE Level{" "}
                  {selectedDetail.company.bbbee_level ?? "—"} ·{" "}
                  {selectedDetail.company.cidb_crs_num ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                data-testid="admin-company-detail-close"
                className="rounded-sm border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
                data-testid="admin-company-detail-docs"
              >
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Compliance documents
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {selectedDetail.compliance.total} total · {selectedDetail.compliance.compliant}{" "}
                  compliant · {selectedDetail.compliance.expired} expired
                </p>
                <ul className="mt-3 space-y-1 text-xs">
                  {selectedDetail.docs.slice(0, 6).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-zinc-400"
                    >
                      <span className="truncate">
                        {d.doc_type}: {d.file_name}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${d.is_compliant ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}
                      >
                        {d.is_compliant ? "ok" : "non-compliant"}
                      </span>
                    </li>
                  ))}
                  {selectedDetail.docs.length === 0 && (
                    <li className="text-zinc-400">No documents</li>
                  )}
                </ul>
              </div>
              <div
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
                data-testid="admin-company-detail-tenders"
              >
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Tenders
                </p>
                <p className="mt-1 text-2xl font-bold">{selectedDetail.tenders.length}</p>
                <ul className="mt-3 space-y-1 text-xs">
                  {selectedDetail.tenders.map((t) => (
                    <li key={t.id} className="truncate text-zinc-300">
                      {t.title} · <span className="text-zinc-400">{t.fit_score}%</span>
                    </li>
                  ))}
                  {selectedDetail.tenders.length === 0 && (
                    <li className="text-zinc-400">No tenders</li>
                  )}
                </ul>
              </div>
              <div
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
                data-testid="admin-company-detail-credits"
              >
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Credits & reminders
                </p>
                <p className="mt-1 text-2xl font-bold">{selectedDetail.credits}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  Reminders: {selectedDetail.reminders.length} · EFT: {selectedDetail.eft.length}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {selectedDetail.reminders.slice(0, 3).map((r) => (
                    <li key={r.id}>
                      threshold {r.threshold} · {new Date(r.sent_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4"
            data-testid="admin-delete-dialog"
          >
            <div className="w-full max-w-md rounded-sm border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
              <h2 className="text-lg font-bold tracking-tight text-white">Delete company?</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                This will permanently delete{" "}
                <span className="font-semibold text-white">{pendingDelete.company_name}</span> (
                {pendingDelete.cipc_num}) and cascade across:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                <li>Compliance documents (and R2 files)</li>
                <li>Tenders (and PDFs)</li>
                <li>Credits and sent reminders</li>
                <li>EFT payments for this company</li>
                <li>Referral rewards tied to this company</li>
              </ul>
              <p className="mt-3 text-xs font-semibold text-amber-300">
                Cascading deletes across companies, documents, tenders, payments, referrals, and
                rewards. This cannot be undone.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  data-testid="admin-delete-cancel"
                  className="rounded-sm border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  data-testid="admin-delete-confirm"
                  className="rounded-sm bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete company"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
