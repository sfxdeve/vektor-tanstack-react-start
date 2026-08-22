import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin-layout";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend, type EftPayment } from "@/lib/api-client";
import { qk } from "@/lib/api-client";
import { useAdminGuard } from "@/hooks/use-admin-guard";

export const Route = createFileRoute("/admin/eft")({
  component: AdminEftPage,
});

const STATUS_META: Record<string, { label: string; className: string }> = {
  awaiting_proof: {
    label: "Awaiting proof",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  pending_review: {
    label: "Pending review",
    className: "border-teal-500/30 bg-teal-500/10 text-teal-300",
  },
  confirmed: {
    label: "Confirmed",
    className: "border-green-500/30 bg-green-500/10 text-green-300",
  },
  rejected: { label: "Rejected", className: "border-red-500/30 bg-red-500/10 text-red-300" },
};

const FILTERS = [
  { key: "pending_review", label: "Pending review", testId: "filter-pending" },
  { key: "awaiting_proof", label: "Awaiting proof", testId: "filter-awaiting" },
  { key: "confirmed", label: "Confirmed", testId: "filter-confirmed" },
  { key: "rejected", label: "Rejected", testId: "filter-rejected" },
  { key: "all", label: "All", testId: "filter-all" },
];

async function fetchAdminEft(filter: string): Promise<{ payments: EftPayment[] }> {
  const params = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
  return apiGet<{ payments: EftPayment[] }>(`/api/eft/admin/all${params}`);
}

function AdminEftPage() {
  const queryClient = useQueryClient();
  const { session, isPending } = useAdminGuard();
  const isAdmin = session?.user?.role === "admin";
  const [filter, setFilter] = useState<string>("pending_review");
  const [proofPayment, setProofPayment] = useState<EftPayment | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofContentType, setProofContentType] = useState<string | null>(null);
  const [rejectPayment, setRejectPayment] = useState<EftPayment | null>(null);
  const [confirmPayment_, setConfirmPayment_] = useState<EftPayment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const paymentsQueryResult = useQuery({
    queryKey: qk.adminEft(filter),
    queryFn: () => fetchAdminEft(filter),
    enabled: !isPending && isAdmin,
  });
  const payments = paymentsQueryResult.data?.payments ?? [];

  const invalidatePayments = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "eft"] });

  const confirmMutation = useMutation({
    mutationFn: (paymentId: string) => apiSend("POST", `/api/eft/admin/${paymentId}/confirm`),
    onSuccess: () => invalidatePayments(),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiSend("POST", `/api/eft/admin/${paymentId}/reject`, { reason }),
    onSuccess: () => invalidatePayments(),
  });

  const stats = useMemo(() => {
    const total = payments.length;
    const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);
    return { total, totalAmount };
  }, [payments]);

  const openProof = async (payment: EftPayment) => {
    setProofPayment(payment);
    setProofUrl(null);
    setProofContentType(null);
    try {
      const r = await fetch(`/api/eft/admin/proof/${payment.id}`);
      if (!r.ok) throw new Error("Could not load proof");
      const ct = r.headers.get("content-type") || payment.proof_content_type || "";
      setProofContentType(ct);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setProofUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load proof");
      setProofPayment(null);
    }
  };

  const closeProof = () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    setProofPayment(null);
    setProofUrl(null);
    setProofContentType(null);
  };

  const confirmPayment = async (payment: EftPayment) => {
    try {
      await confirmMutation.mutateAsync(payment.id);
      toast.success(`Payment ${payment.reference} confirmed — credits granted`);
      setConfirmPayment_(null);
      closeProof();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm payment");
    }
  };

  const openReject = (payment: EftPayment) => {
    setRejectPayment(payment);
    setRejectReason("");
  };

  const submitReject = async () => {
    if (!rejectPayment) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    try {
      await rejectMutation.mutateAsync({
        paymentId: rejectPayment.id,
        reason: rejectReason.trim(),
      });
      toast.success(`Payment ${rejectPayment.reference} rejected`);
      setRejectPayment(null);
      setRejectReason("");
      closeProof();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject payment");
    }
  };

  if (isPending || !session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Spinner className="h-6 w-6 text-zinc-400" />
      </div>
    );
  }

  return (
    <AdminShell active="eft">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
              EFT Payments
            </p>
            <h1
              className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"
              data-testid="admin-eft-title"
            >
              EFT console
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
              Review incoming bank transfers. Confirm to grant credits (idempotent) and best-effort
              trigger referral rewards; reject requires a reason and allows re-upload →
              pending_review. Auditable via D1 state on manual_payments and referral_rewards.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void paymentsQueryResult.refetch()}
            disabled={paymentsQueryResult.isFetching}
            data-testid="admin-eft-refresh"
            className="inline-flex items-center gap-2 self-start rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="admin-eft-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              data-testid={`admin-eft-${f.testId}`}
              className={`rounded-sm border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                filter === f.key
                  ? "border-zinc-100 bg-white text-zinc-900"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-400" data-testid="admin-eft-summary">
            {stats.total} record{stats.total === 1 ? "" : "s"} · R
            {stats.totalAmount.toLocaleString("en-ZA", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="admin-eft-table">
              <thead className="border-b border-zinc-800 bg-zinc-900">
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Package</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paymentsQueryResult.isFetching && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!paymentsQueryResult.isFetching && payments.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                      data-testid="admin-eft-empty"
                    >
                      No {filter === "all" ? "" : filter.replace("_", " ")} payments
                    </td>
                  </tr>
                )}
                {!paymentsQueryResult.isFetching &&
                  payments.map((p) => {
                    const meta = STATUS_META[p.status] ?? {
                      label: p.status,
                      className: "border-zinc-700 bg-zinc-800 text-zinc-300",
                    };
                    return (
                      <tr
                        key={p.id}
                        data-testid={`admin-eft-row-${p.id}`}
                        className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-white">
                          {p.reference}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-white">{p.user_email}</p>
                          <p className="text-xs text-zinc-400">{p.company_name || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-white">{p.package_name}</p>
                          <p className="text-xs text-zinc-400">
                            {p.annual_credits || p.credits} credits · {p.billing_period}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white">
                          R
                          {p.amount.toLocaleString("en-ZA", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                          {p.status === "rejected" && p.reject_reason && (
                            <p
                              className="mt-1 max-w-[200px] truncate text-[11px] text-red-400"
                              title={p.reject_reason}
                            >
                              {p.reject_reason}
                            </p>
                          )}
                          {p.status === "confirmed" && p.credits_granted != null && (
                            <p className="mt-1 text-[11px] text-green-400">
                              +{p.credits_granted} credits
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          {new Date(p.created_at).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {p.proof_path && (
                              <button
                                type="button"
                                onClick={() => void openProof(p)}
                                data-testid={`admin-eft-view-proof-${p.id}`}
                                className="rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                              >
                                Proof
                              </button>
                            )}
                            {p.status === "pending_review" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmPayment_(p)}
                                  data-testid={`admin-eft-confirm-${p.id}`}
                                  className="rounded-sm bg-teal-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReject(p)}
                                  disabled={rejectMutation.isPending}
                                  data-testid={`admin-eft-reject-${p.id}`}
                                  className="rounded-sm border border-red-800 bg-red-950/50 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/30 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Proof dialog */}
        {proofPayment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4"
            data-testid="admin-eft-proof-dialog"
          >
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-white">
                    Proof · {proofPayment.reference}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {proofPayment.package_name} · {proofPayment.user_email} ·{" "}
                    {proofPayment.company_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeProof}
                  data-testid="admin-eft-proof-close"
                  className="rounded-sm border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-zinc-950 p-6">
                {!proofUrl ? (
                  <p className="py-10 text-center text-sm text-zinc-400">Loading proof…</p>
                ) : proofContentType?.includes("pdf") ? (
                  <div className="space-y-3">
                    <iframe
                      src={proofUrl}
                      title="Proof PDF"
                      className="h-[60vh] w-full rounded-sm border border-zinc-800 bg-white"
                      data-testid="admin-eft-proof-pdf"
                    />
                    <a
                      href={proofUrl}
                      download={proofPayment.proof_filename || "proof.pdf"}
                      data-testid="admin-eft-proof-download"
                      className="inline-flex rounded-sm bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 hover:bg-zinc-100"
                    >
                      Download
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <img
                      src={proofUrl}
                      alt="Proof"
                      className="mx-auto max-h-[60vh] rounded-sm border border-zinc-800"
                      data-testid="admin-eft-proof-image"
                    />
                    <a
                      href={proofUrl}
                      download={proofPayment.proof_filename || "proof"}
                      data-testid="admin-eft-proof-download"
                      className="inline-flex rounded-sm bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 hover:bg-zinc-100"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
              {proofPayment.status === "pending_review" && (
                <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => openReject(proofPayment)}
                    data-testid="admin-eft-proof-reject"
                    className="rounded-sm border border-red-800 bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-900/30"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPayment_(proofPayment)}
                    data-testid="admin-eft-proof-confirm"
                    className="rounded-sm bg-teal-800 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    Confirm & grant credits
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reject dialog */}
        {rejectPayment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4"
            data-testid="admin-eft-reject-dialog"
          >
            <div className="w-full max-w-md rounded-sm border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
              <h2 className="text-lg font-bold tracking-tight text-white">Reject payment?</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Rejecting{" "}
                <span className="font-mono font-semibold text-white">
                  {rejectPayment.reference}
                </span>{" "}
                will set status to
                <span className="font-semibold text-white"> rejected</span> and allow the user to
                re-upload proof → pending_review.
              </p>
              <div className="mt-4">
                <label
                  htmlFor="admin-eft-reject-reason"
                  className="block text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase"
                >
                  Reason (required)
                </label>
                <Textarea
                  id="admin-eft-reject-reason"
                  data-testid="admin-eft-reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., Proof does not match amount, incomplete transfer, name mismatch"
                  rows={3}
                  className="mt-1 rounded-sm border-zinc-700 bg-zinc-950 text-white focus-visible:border-teal-500"
                />
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectPayment(null)}
                  data-testid="admin-eft-reject-cancel"
                  className="rounded-sm border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitReject()}
                  disabled={rejectMutation.isPending}
                  data-testid="admin-eft-reject-submit"
                  className="rounded-sm bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {rejectMutation.isPending ? "Rejecting…" : "Reject payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm dialog */}
        <AlertDialog
          open={confirmPayment_ != null}
          onOpenChange={(open) => {
            if (!open) setConfirmPayment_(null);
          }}
        >
          <AlertDialogContent className="border-zinc-800 bg-zinc-900 sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm this EFT payment?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmPayment_?.package_name} (
                <span className="font-mono">{confirmPayment_?.reference}</span>) from{" "}
                {confirmPayment_?.user_email}. This grants{" "}
                {confirmPayment_ ? (confirmPayment_.annual_credits ?? confirmPayment_.credits) : 0}{" "}
                credits and triggers the referrer reward (best-effort). This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmPayment_) void confirmPayment(confirmPayment_);
                }}
                disabled={confirmMutation.isPending}
                className="bg-teal-700 text-white hover:bg-teal-600"
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm & grant credits"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminShell>
  );
}
