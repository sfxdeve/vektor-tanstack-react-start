import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend, qk } from "@/lib/api-client";
import { formatDate } from "@/lib/date";

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

function fetchAdminCompanies(q: string): Promise<CompanyRow[]> {
  const url = q ? `/api/admin/companies?q=${encodeURIComponent(q)}` : "/api/admin/companies";
  return apiGet<CompanyRow[]>(url);
}

function AdminCompaniesPage() {
  const queryClient = useQueryClient();
  // Debounced server-side search; the API applies it before its result cap.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CompanyRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const companiesQueryResult = useQuery({
    queryKey: [...qk.adminCompanies, search],
    queryFn: () => fetchAdminCompanies(search),
  });
  const companies = companiesQueryResult.data;
  const filtered = companies ?? null;

  const openDetail = async (row: CompanyRow) => {
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      setSelectedDetail(await apiGet<CompanyDetail>(`/api/admin/companies/${row.id}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiSend<{ cascaded?: unknown }>("DELETE", `/api/admin/companies/${companyId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.adminCompanies }),
  });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const body = await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success(`Deleted "${pendingDelete.company_name}"`, {
        description: `Cascaded: ${JSON.stringify(body?.cascaded ?? {})}`,
      });
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleImpersonate = async (row: CompanyRow) => {
    if (!row.user_id) {
      toast.error("This company has no owner to impersonate");
      return;
    }
    setImpersonatingId(row.id);
    try {
      await apiSend("POST", `/api/admin/impersonate/${row.user_id}`);
      toast.success(`Impersonating ${row.owner_email || "user"}`);
      window.location.href = "/app";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpersonatingId(null);
    }
  };

  if (companiesQueryResult.isError) {
    return (
      <div className="py-16 text-center" data-testid="admin-companies-error">
        <p className="text-sm text-red-300">Could not load companies.</p>
        <button
          type="button"
          data-testid="admin-companies-retry"
          onClick={() => void companiesQueryResult.refetch()}
          className="mt-4 rounded-sm border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
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
          onClick={() => void companiesQueryResult.refetch()}
          disabled={companiesQueryResult.isFetching}
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
        <Input
          type="search"
          placeholder="Search by company, CIPC, or owner"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          data-testid="admin-companies-search"
          aria-label="Search companies"
          className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none sm:w-80"
        />
      </div>

      <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Company
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Owner
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Docs
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Tenders
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Credits
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Created
                </TableHead>
                <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {companiesQueryResult.isPending && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="px-6 py-10 text-center text-sm text-zinc-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {companies !== null && filtered && filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="px-6 py-10 text-center text-sm text-zinc-400"
                    data-testid="admin-companies-empty"
                  >
                    No companies yet.
                  </TableCell>
                </TableRow>
              )}
              {filtered &&
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    data-testid={`admin-row-${r.id}`}
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900"
                  >
                    <TableCell className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => void openDetail(r)}
                        data-testid={`admin-company-open-${r.id}`}
                        aria-label={`Open details for ${r.company_name}`}
                        className="text-left"
                      >
                        <p className="font-semibold text-white">{r.company_name}</p>
                        <p className="text-xs text-zinc-400">{r.cipc_num}</p>
                      </button>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <p className="text-xs font-semibold text-white">{r.owner_email || "—"}</p>
                      {r.owner_name && <p className="text-xs text-zinc-400">{r.owner_name}</p>}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-zinc-300">
                      {r.doc_count}{" "}
                      {r.expired_doc_count > 0 && (
                        <span className="ml-1 rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                          {r.expired_doc_count} expired
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-zinc-300">{r.tender_count}</TableCell>
                    <TableCell className="px-6 py-4 text-zinc-300">{r.credits}</TableCell>
                    <TableCell className="px-6 py-4 text-xs text-zinc-400">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={`admin-impersonate-${r.id}`}
                          aria-label={`Impersonate ${r.company_name}`}
                          onClick={() => void handleImpersonate(r)}
                          disabled={impersonatingId === r.id || !r.user_id}
                          className="rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {impersonatingId === r.id ? "…" : "Impersonate"}
                        </button>
                        <button
                          type="button"
                          data-testid={`admin-delete-${r.id}`}
                          onClick={() => setPendingDelete(r)}
                          className="rounded-sm border border-red-900/40 bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/40"
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
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
                  <li key={d.id} className="flex items-center justify-between gap-2 text-zinc-400">
                    <span className="truncate">
                      {d.doc_type}: {d.file_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${d.is_compliant ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}
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
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">Tenders</p>
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
                    threshold {r.threshold} · {formatDate(r.sent_at)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          data-testid="admin-delete-dialog"
          className="border-zinc-800 bg-zinc-900 text-white sm:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete company?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This permanently deletes {pendingDelete?.company_name} ({pendingDelete?.cipc_num}),
              including its documents, tenders, credits, reminders and EFT payments. Referral reward
              audit rows are retained without the deleted company link. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs text-zinc-400">
            <p className="font-semibold text-amber-300">Cascading deletes include:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Compliance documents and stored files</li>
              <li>Tenders and stored PDFs</li>
              <li>Credits, reminders and EFT payments</li>
            </ul>
          </div>
          <AlertDialogFooter className="border-zinc-800 bg-zinc-950/50">
            <AlertDialogCancel data-testid="admin-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              data-testid="admin-delete-confirm"
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete company"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
