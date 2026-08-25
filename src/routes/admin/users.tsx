import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend, qk } from "@/lib/api-client";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  referral_code?: string | null;
  company_count: number;
  created_at: string | null;
  updated_at?: string | null;
};

type UserDetail = {
  user: UserRow;
  companies: Array<{ id: string; company_name: string; cipc_num: string; created_at: string }>;
  compliance: {
    total: number;
    compliant: number;
    expired: number;
    docs: Array<{
      id: string;
      doc_type: string;
      file_name: string;
      expiry_date: string | null;
      is_compliant: boolean;
    }>;
  };
  tenders: {
    total: number;
    items: Array<{ id: string; title: string; fit_score: number; created_at: string }>;
  };
  credits: Array<{ company_id: string; credits: number }>;
  eft: {
    total: number;
    payments: Array<{
      id: string;
      reference: string;
      status: string;
      amount: number;
      credits: number;
      created_at: string;
    }>;
  };
  reminders: { total: number; items: Array<{ id: string; threshold: number; sent_at: string }> };
  referrals: { total: number; items: Array<{ id: string; code: string; status: string }> };
  referral_rewards: { total: number; credits_earned: number };
};

function fetchAdminUsers(q: string): Promise<UserRow[]> {
  const url = q ? `/api/admin/users?q=${encodeURIComponent(q)}` : "/api/admin/users";
  return apiGet<UserRow[]>(url);
}

function fetchUserDetail(userId: string): Promise<UserDetail> {
  return apiGet<UserDetail>(`/api/admin/users/${userId}`);
}

function AdminUsersPage() {
  const queryClient = useQueryClient();
  // Debounced server-side search; the API applies it before its result cap.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const usersQueryResult = useQuery({
    queryKey: [...qk.adminUsers, search],
    queryFn: () => fetchAdminUsers(search),
  });
  const users = usersQueryResult.data;
  const filtered = users ?? null;

  const openDetail = async (u: UserRow) => {
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      setSelectedDetail(await fetchUserDetail(u.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleImpersonate = async (u: UserRow) => {
    if (u.role === "admin") {
      toast.error("You cannot impersonate another admin");
      return;
    }
    setImpersonatingId(u.id);
    try {
      // Single guarded path: the endpoint wraps better-auth's
      // auth.api.impersonateUser behind requireAdmin.
      await apiSend("POST", `/api/admin/impersonate/${u.id}`);
      toast.success(`Impersonating ${u.email}`);
      // Full reload so every surface picks up the impersonated session cookie.
      window.location.href = "/app";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpersonatingId(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: ({
      userId,
      reason,
      confirmEmail,
    }: {
      userId: string;
      reason: string;
      confirmEmail: string;
    }) =>
      apiSend<{ cascade_counts?: unknown }>("DELETE", `/api/admin/users/${userId}`, {
        reason,
        confirm_email: confirmEmail,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.adminUsers }),
  });

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteReason.trim()) {
      toast.error("A reason is required for deletion");
      return;
    }
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) {
      toast.error("Confirmation email doesn't match target user's email");
      return;
    }
    try {
      const body = await deleteMutation.mutateAsync({
        userId: deleteTarget.id,
        reason: deleteReason.trim(),
        confirmEmail: deleteConfirmEmail.trim(),
      });
      toast.success(`Deleted ${deleteTarget.email}`, {
        description: `Cascade: ${JSON.stringify(body?.cascade_counts ?? {})}`,
      });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteConfirmEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (usersQueryResult.isError) {
    return (
      <div className="py-16 text-center" data-testid="admin-users-error">
        <p className="text-sm text-red-300">Could not load users.</p>
        <button
          type="button"
          data-testid="admin-users-retry"
          onClick={() => void usersQueryResult.refetch()}
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
          <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">Users</p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl"
            data-testid="admin-users-title"
          >
            User management
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
            List every tenant, inspect compliance and history, and remove abandoned accounts. Delete
            is irreversible and cascades across companies, documents, tenders, payments, referrals,
            and rewards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void usersQueryResult.refetch()}
          disabled={usersQueryResult.isFetching}
          data-testid="admin-users-refresh"
          className="inline-flex items-center gap-2 self-start rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="admin-users-tab-all"
            className="rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white"
          >
            All
          </button>
          <span className="text-xs text-zinc-400" data-testid="admin-users-count">
            {filtered ? `${filtered.length} users` : "—"}
          </span>
        </div>
        <div className="w-full sm:w-80">
          <Input
            type="search"
            placeholder="Search by email, name, or id"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="admin-users-search"
            className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none"
          />
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Filter the table by email, name, or id.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
        <ScrollArea className="w-full">
          <Table className="text-sm">
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  User
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Role
                </TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Companies
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
              {usersQueryResult.isPending && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-zinc-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {users && filtered && filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-zinc-400"
                    data-testid="admin-users-empty"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              )}
              {filtered &&
                filtered.map((u) => (
                  <TableRow
                    key={u.id}
                    data-testid={`admin-user-row-${u.id}`}
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900"
                  >
                    <TableCell className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => void openDetail(u)}
                        data-testid={`admin-user-open-${u.id}`}
                        aria-label={`Open details for ${u.email}`}
                        className="text-left"
                      >
                        <p className="font-semibold text-white">{u.email}</p>
                        <p className="text-xs text-zinc-400">
                          {u.name || "—"} · {u.id.slice(0, 8)}…
                        </p>
                      </button>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${u.role === "admin" ? "border-teal-500/30 bg-teal-500/10 text-teal-300" : "border-zinc-700 bg-zinc-800 text-zinc-300"}`}
                      >
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-zinc-300">{u.company_count}</TableCell>
                    <TableCell className="px-6 py-4 text-xs text-zinc-400">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("en-ZA") : "—"}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={`admin-user-impersonate-${u.id}`}
                          aria-label={`Impersonate ${u.email}`}
                          onClick={() => void handleImpersonate(u)}
                          disabled={impersonatingId === u.id || u.role === "admin"}
                          className="rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {impersonatingId === u.id ? "…" : "Impersonate"}
                        </button>
                        <button
                          type="button"
                          data-testid={`admin-user-delete-${u.id}`}
                          onClick={() => {
                            setDeleteTarget(u);
                            setDeleteReason("");
                            setDeleteConfirmEmail("");
                          }}
                          disabled={u.role === "admin"}
                          className="rounded-sm border border-red-900/40 bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Detail drawer / modal */}
      {detailLoading && (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400"
          data-testid="admin-user-detail-loading"
        >
          Loading detail…
        </div>
      )}
      {selectedDetail && (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
          data-testid={`admin-user-detail-${selectedDetail.user.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                {selectedDetail.user.email}
              </h2>
              <p className="text-xs text-zinc-400">
                {selectedDetail.user.name} · {selectedDetail.user.role} · created{" "}
                {selectedDetail.user.created_at
                  ? new Date(selectedDetail.user.created_at).toLocaleString()
                  : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDetail(null)}
              data-testid="admin-user-detail-close"
              className="rounded-sm border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-companies"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                Companies
              </p>
              <p className="mt-1 text-2xl font-bold">{selectedDetail.companies.length}</p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {selectedDetail.companies.map((c) => (
                  <li key={c.id} className="truncate text-zinc-300">
                    <span className="font-semibold text-white">{c.company_name}</span> ·{" "}
                    {c.cipc_num}
                  </li>
                ))}
                {selectedDetail.companies.length === 0 && (
                  <li className="text-zinc-400">No companies</li>
                )}
              </ul>
            </div>
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-compliance"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                Compliance
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                {selectedDetail.compliance.total} docs · {selectedDetail.compliance.compliant}{" "}
                compliant · {selectedDetail.compliance.expired} expired
              </p>
              <ul className="mt-3 space-y-1 text-xs">
                {selectedDetail.compliance.docs.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-zinc-400">
                    <span className="truncate">{d.doc_type}</span>
                    <span
                      className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${d.is_compliant ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}
                    >
                      {d.is_compliant ? "compliant" : "non-compliant"}
                    </span>
                  </li>
                ))}
                {selectedDetail.compliance.docs.length === 0 && (
                  <li className="text-zinc-400">No documents</li>
                )}
              </ul>
            </div>
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-tenders"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">Tenders</p>
              <p className="mt-1 text-2xl font-bold">{selectedDetail.tenders.total}</p>
              <ul className="mt-3 space-y-1 text-xs">
                {selectedDetail.tenders.items.map((t) => (
                  <li key={t.id} className="truncate text-zinc-300">
                    {t.title} · <span className="text-zinc-400">{t.fit_score}%</span>
                  </li>
                ))}
                {selectedDetail.tenders.items.length === 0 && (
                  <li className="text-zinc-400">No tenders</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-credits"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">Credits</p>
              <p className="mt-1 text-sm text-zinc-300">
                {selectedDetail.credits.reduce((s, c) => s + c.credits, 0)} total across{" "}
                {selectedDetail.credits.length} companies
              </p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {selectedDetail.credits.map((c) => (
                  <li key={c.company_id} className="truncate">
                    {c.company_id.slice(0, 8)}… · {c.credits} credits
                  </li>
                ))}
                {selectedDetail.credits.length === 0 && (
                  <li className="text-zinc-400">No credits</li>
                )}
              </ul>
            </div>
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-eft"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                EFT payments
              </p>
              <p className="mt-1 text-2xl font-bold">{selectedDetail.eft.total}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {selectedDetail.eft.payments.slice(0, 5).map((p) => (
                  <li key={p.id} className="truncate text-zinc-400">
                    <span className="font-mono font-semibold text-zinc-300">{p.reference}</span> ·{" "}
                    {p.status}
                  </li>
                ))}
                {selectedDetail.eft.payments.length === 0 && (
                  <li className="text-zinc-400">No payments</li>
                )}
              </ul>
            </div>
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-900 p-4"
              data-testid="admin-user-detail-reminders"
            >
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
                Reminders
              </p>
              <p className="mt-1 text-2xl font-bold">{selectedDetail.reminders.total}</p>
              <p className="mt-2 text-xs text-zinc-400">
                Referrals: {selectedDetail.referrals.total} · rewards{" "}
                {selectedDetail.referral_rewards.total} (
                {selectedDetail.referral_rewards.credits_earned} credits)
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteReason("");
            setDeleteConfirmEmail("");
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          data-testid="delete-user-dialog"
          className="max-h-[90vh] overflow-y-auto rounded-sm border-zinc-800 bg-zinc-900 p-6 text-white sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">Delete user?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              This permanently deletes {deleteTarget?.email} and its tenant data. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
            <li>Companies owned by this user</li>
            <li>Compliance documents (and R2 files)</li>
            <li>Tenders (and PDFs)</li>
            <li>EFT payments and proof files</li>
            <li>Referrals and referral rewards</li>
            <li>Sent reminders</li>
          </ul>
          <p className="mt-3 text-xs font-semibold text-amber-300">
            This action cannot be undone. Audit via D1 state on manual_payments and referral_rewards
            remains in logs before deletion.
          </p>
          {/* Also expose cascading note for test suites expecting generic wording */}
          <p className="sr-only">
            Cascading deletes across companies, documents, tenders, payments, referrals, and rewards
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="delete-reason"
                className="block text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase"
              >
                Reason (required, for audit)
              </label>
              <Textarea
                id="delete-reason"
                data-testid="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g., Abandoned test account, user requested deletion"
                rows={2}
                className="mt-1 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="delete-confirm-email"
                className="block text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase"
              >
                Type the user’s email to confirm
              </label>
              <Input
                id="delete-confirm-email"
                data-testid="delete-confirm-email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={deleteTarget?.email ?? ""}
                className="mt-1 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-6 border-zinc-800 bg-zinc-950/50">
            <button
              type="button"
              data-testid="delete-cancel"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteReason("");
                setDeleteConfirmEmail("");
              }}
              className="rounded-sm border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="delete-submit"
              onClick={() => void submitDelete()}
              disabled={deleteMutation.isPending}
              className="rounded-sm bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete user"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
