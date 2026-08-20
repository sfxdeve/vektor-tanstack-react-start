// oxlint-disable react/set-state-in-effect
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

type PackageApi = {
  id: string;
  lookup_key: string;
  name: string;
  description: string;
  persona?: string;
  tagline?: string;
  amount: number;
  amount_cents: number;
  currency: string;
  credits: number;
  annual_credits: number | null;
  type: string;
  interval: string | null;
  is_popular: boolean;
  billing_period: string;
  per_analysis: number;
};

type Company = { id: string; company_name: string; companyName?: string };

type EftPayment = {
  id: string;
  reference: string;
  user_id: string;
  user_email: string;
  company_id: string;
  company_name: string;
  lookup_key: string;
  package_name: string;
  amount: number;
  amount_cents?: number;
  credits: number;
  annual_credits: number | null;
  billing_period: string;
  type: string;
  status: string;
  proof_path: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
};

const TIER_COPY: Record<string, { persona: string; tagline: string; support: string }> = {
  tc_starter_monthly_v2: {
    persona: "Freelancers & occasional tender bidders",
    tagline: "Standard compliance check",
    support: "Email support",
  },
  tc_pro_monthly_v2: {
    persona: "Growing businesses bidding monthly",
    tagline: "Priority compliance check",
    support: "Priority support",
  },
  tc_scale_monthly_v2: {
    persona: "Active contractors & high-volume vendors",
    tagline: "Fast-track processing",
    support: "Dedicated support",
  },
};

function BillingPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [packages, setPackages] = useState<PackageApi[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [creditsMap, setCreditsMap] = useState<Record<string, number>>({});
  const [myPayments, setMyPayments] = useState<EftPayment[]>([]);
  const [dialogPkg, setDialogPkg] = useState<PackageApi | null>(null);
  const [dialogExisting, setDialogExisting] = useState<EftPayment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;

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
      return;
    }
  }, [session, isPending, navigate]);

  // Load packages (public)
  useEffect(() => {
    fetch("/api/billing/packages")
      .then((r) => r.json())
      .then((d) => setPackages((d as { packages: PackageApi[] }).packages ?? []))
      .catch(() => setPackages([]));
  }, []);

  // Load companies
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? (data as Company[]) : [];
        setCompanies(list);
        if (list.length > 0 && !selectedCompanyId) {
          setSelectedCompanyId(list[0]!.id);
        }
      })
      .catch(() => setCompanies([]));
  }, [session, selectedCompanyId]);

  const loadCredits = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/billing/credits/${companyId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { credits: number };
      setCreditsMap((prev) => ({ ...prev, [companyId]: data.credits ?? 0 }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (selectedCompany) void loadCredits(selectedCompany.id);
  }, [selectedCompany, loadCredits]);

  const loadMyPayments = useCallback(async () => {
    try {
      const r = await fetch("/api/eft/my-requests");
      if (!r.ok) {
        setMyPayments([]);
        return;
      }
      const d = (await r.json()) as { payments: EftPayment[] };
      setMyPayments(d.payments ?? []);
    } catch {
      setMyPayments([]);
    }
  }, []);

  useEffect(() => {
    if (session?.user) void loadMyPayments();
  }, [session, loadMyPayments]);

  const openEftDialog = (pkg: PackageApi) => {
    if (!selectedCompany) {
      toast.error("Please create a company profile first");
      return;
    }
    setDialogExisting(null);
    setDialogPkg(pkg);
    setDialogOpen(true);
  };

  const reuploadForPayment = (payment: EftPayment) => {
    // reconstruct minimal pkg for dialog header from payment
    const pkg =
      packages.find((p) => p.lookup_key === payment.lookup_key) ??
      ({
        id: payment.lookup_key,
        lookup_key: payment.lookup_key,
        name: payment.package_name,
        description: "",
        amount: payment.amount,
        amount_cents: Math.round(payment.amount * 100),
        currency: "zar",
        credits: payment.credits,
        annual_credits: payment.annual_credits,
        type: payment.type,
        interval: payment.billing_period === "monthly" ? "month" : null,
        is_popular: false,
        billing_period: payment.billing_period,
        per_analysis: 0,
      } as PackageApi);
    setDialogPkg(pkg);
    setDialogExisting(payment);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    // delay clearing to allow animation
    setTimeout(() => {
      setDialogPkg(null);
      setDialogExisting(null);
    }, 200);
    void loadMyPayments();
    if (selectedCompany) void loadCredits(selectedCompany.id);
  };

  const handleCancel = async (payment: EftPayment) => {
    try {
      const res = await fetch(`/api/eft/request/${payment.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail || "Failed to cancel");
      }
      toast.success("Payment cancelled");
      await loadMyPayments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  };

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

  if (!companies.length) {
    return (
      <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
        <ImpersonationBanner />
        <Sidebar />
        <main className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
          <div className="text-center" data-testid="no-company-message">
            <p className="text-zinc-600 mb-4">No company profile found.</p>
            <Button
              data-testid="create-company-btn"
              onClick={() => void navigate({ to: "/setup" })}
            >
              Create Company Profile
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const subscriptionPkgs = packages.filter((p) => p.type === "subscription");
  const paygPkgs = packages.filter((p) => p.type === "one_time");
  const currentCredits = selectedCompany ? (creditsMap[selectedCompany.id] ?? 0) : 0;
  // Show every non-confirmed payment — awaiting_proof, pending_review, rejected (spec: pending/awaiting can be listed, rejected allows re-upload)
  const activeEfts = myPayments.filter((p) => p.status !== "confirmed");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
      <ImpersonationBanner />
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-50">
        <div className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <Button
            data-testid="back-btn"
            variant="ghost"
            onClick={() => void navigate({ to: "/app" })}
            className="-ml-2 mb-4"
          >
            ← Back to Dashboard
          </Button>
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
            data-testid="billing-title"
          >
            Billing & Credits
          </h1>
          <p className="mt-2 text-sm text-zinc-600 sm:text-base">
            Pay by EFT directly to our bank account. Credits are added within 1 business day of
            verification. All prices in ZAR. No card fees.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Payments are facilitated by{" "}
            <span className="font-semibold text-zinc-800">EcoBuiltConnect (Pty) Ltd</span> via First
            National Bank.
          </p>
          {companies.length > 1 && selectedCompany && (
            <div className="mt-4 max-w-sm">
              <label
                htmlFor="billing-company-select"
                className="text-xs font-semibold tracking-[0.1em] uppercase"
              >
                Company
              </label>
              <select
                id="billing-company-select"
                data-testid="select-company"
                value={selectedCompany.id}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="mt-1 w-full rounded-sm border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-8">
          {/* Current Balance */}
          <Card
            className="rounded-sm border-zinc-200 shadow-none mb-8 bg-zinc-900 text-white"
            data-testid="current-balance-card"
          >
            <CardContent className="p-5 sm:p-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400 mb-2">
                    Current Balance
                  </p>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span
                      className="text-3xl sm:text-4xl md:text-5xl font-bold"
                      data-testid="credit-count"
                    >
                      {currentCredits}
                    </span>
                    <span className="text-sm sm:text-lg text-zinc-400">
                      tender analysis credits
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400" data-testid="credit-company-hint">
                    Company: {selectedCompany?.company_name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* My EFT payments */}
          {activeEfts.length > 0 && (
            <div className="mb-8" data-testid="my-eft-payments-section">
              <h2 className="mb-3 text-lg font-bold flex items-center gap-2">Your EFT payments</h2>
              <div className="space-y-3">
                {activeEfts.map((p) => (
                  <EftStatusRow
                    key={p.id}
                    payment={p}
                    onReupload={() => reuploadForPayment(p)}
                    onCancel={() => handleCancel(p)}
                    onRefresh={loadMyPayments}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Everything included banner */}
          <div
            className="mb-8 rounded-sm border border-zinc-200 bg-white p-5"
            data-testid="everything-included-banner"
          >
            <div className="flex items-start gap-3">
              <span className="text-teal-600 mt-0.5">✓</span>
              <div>
                <p className="font-semibold text-sm text-zinc-900">
                  Every feature is included on every plan.
                </p>
                <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
                  Document vault, SBD 4 &amp; 6.1 auto-generation, risk alerts and expiry tracking
                  work identically whether you subscribe or buy a credit pack. Subscribers get one
                  extra perk: <strong className="text-zinc-900">unused credits roll over</strong>,
                  up to 2× your monthly allowance.
                </p>
              </div>
            </div>
          </div>

          {/* Subscription plans */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold tracking-tight">Monthly Subscriptions</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="subscription-grid">
              {subscriptionPkgs.map((pkg) => {
                const rolloverCap = pkg.credits * 2;
                const tier = TIER_COPY[pkg.id] ?? {
                  persona: pkg.persona ?? "",
                  tagline: pkg.tagline ?? "Full compliance suite",
                  support: "Email support",
                };
                return (
                  <Card
                    key={pkg.id}
                    data-testid={`package-${pkg.id}`}
                    className={`rounded-sm shadow-none relative ${pkg.is_popular ? "border-2 border-teal-600 shadow-md" : "border border-zinc-200"}`}
                  >
                    {pkg.is_popular && (
                      <div
                        data-testid={`popular-badge-${pkg.id}`}
                        className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-[10px] uppercase tracking-[0.2em] font-bold px-3 py-1 rounded-sm"
                      >
                        Most Popular
                      </div>
                    )}
                    <CardHeader className="border-b border-zinc-200">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">Plan</p>
                      <CardTitle className="text-2xl font-bold">{pkg.name}</CardTitle>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-3xl font-bold">R{pkg.amount}</span>
                        <span className="text-sm text-zinc-500">/ month</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 leading-snug">{tier.persona}</p>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <ul className="space-y-3 mb-6">
                        <li className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span>
                            <strong>{pkg.credits}</strong> tender analyses / month
                          </span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <span className="text-teal-600 mt-0.5">✓</span>
                          <span>{tier.tagline}</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span>Full PDF audit report</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span>{tier.support}</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <span className="text-teal-600 mt-0.5">✓</span>
                          <span>
                            <strong>Rollover</strong> — bank up to <strong>{rolloverCap}</strong>{" "}
                            unused credits
                          </span>
                        </li>
                      </ul>
                      <Button
                        data-testid={`subscribe-${pkg.id}`}
                        onClick={() => openEftDialog(pkg)}
                        className={`w-full ${pkg.is_popular ? "bg-teal-600 hover:bg-teal-700 text-white" : "bg-zinc-900 hover:bg-zinc-800 text-white"}`}
                      >
                        Pay by EFT
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* PAYG packs */}
          <div data-testid="payg-section">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold tracking-tight">Pay-As-You-Go</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {paygPkgs.map((pkg) => (
                <Card
                  key={pkg.id}
                  className="rounded-sm shadow-none border-zinc-200"
                  data-testid={`package-${pkg.id}`}
                >
                  <CardHeader className="border-b border-zinc-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">
                      Credit Pack
                    </p>
                    <CardTitle className="text-2xl font-bold">{pkg.name}</CardTitle>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-bold">R{pkg.amount}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2 leading-snug">
                      Perfect for quick one-off tender checks
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <ul className="space-y-3 mb-6">
                      <li className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>
                          <strong>{pkg.credits}</strong> tender analysis credit
                          {pkg.credits > 1 ? "s" : ""}
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <span className="text-teal-600 mt-0.5">✓</span>
                        <span>Credit never expires — use whenever you bid</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>Full compliance suite — vault, SBD forms, alerts</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>One-time payment — no recurring billing</span>
                      </li>
                    </ul>
                    <Button
                      data-testid={`buy-${pkg.id}`}
                      onClick={() => openEftDialog(pkg)}
                      variant="outline"
                      className="w-full border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white"
                    >
                      Pay by EFT
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <p className="text-xs text-zinc-500 mt-8">
            All payments are by EFT to our First National Bank business account. Credits are added
            within 1 business day of verification. You&apos;ll receive a confirmation email at the
            address on your account.
          </p>
        </div>
      </main>

      {dialogPkg && (
        <EftPaymentDialog
          open={dialogOpen}
          onClose={closeDialog}
          pkg={dialogPkg}
          companyId={selectedCompany?.id ?? null}
          existingPayment={dialogExisting}
          onSubmitted={async () => {
            await loadMyPayments();
            if (selectedCompany) await loadCredits(selectedCompany.id);
          }}
        />
      )}
    </div>
  );
}

function EftStatusRow({
  payment,
  onReupload,
  onCancel,
}: {
  payment: EftPayment;
  onReupload: () => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  const cfg: Record<
    string,
    { icon: string; color: string; label: string; description: string; action: string | null }
  > = {
    awaiting_proof: {
      icon: "◷",
      color: "text-amber-700 bg-amber-50 border-amber-200",
      label: "Awaiting proof",
      description: "You started a payment but haven't uploaded proof yet.",
      action: "Upload proof",
    },
    pending_review: {
      icon: "◷",
      color: "text-teal-700 bg-teal-50 border-teal-200",
      label: "Verifying payment",
      description:
        "We received your proof of payment. Credits will be added within 1 business day.",
      action: null,
    },
    rejected: {
      icon: "✕",
      color: "text-red-700 bg-red-50 border-red-200",
      label: "Rejected",
      description: payment.reject_reason || "Please re-upload proof of payment.",
      action: "Re-upload proof",
    },
    confirmed: {
      icon: "✓",
      color: "text-green-700 bg-green-50 border-green-200",
      label: "Confirmed",
      description: "Credits have been added.",
      action: null,
    },
  };
  const config = cfg[payment.status];
  if (!config) return null;

  const canCancel = payment.status === "awaiting_proof" || payment.status === "pending_review";

  return (
    <div
      data-testid={`eft-status-${payment.id}`}
      className={`rounded-sm border p-4 flex items-start gap-3 ${config.color}`}
    >
      <span className="shrink-0 mt-0.5 text-lg" aria-hidden>
        {config.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm">{config.label}</p>
          <span className="text-xs opacity-70">·</span>
          <p className="text-xs font-mono" data-testid={`eft-row-reference-${payment.id}`}>
            {payment.reference}
          </p>
          <span className="text-xs opacity-70">·</span>
          <p className="text-xs">R{payment.amount}</p>
          <span className="text-xs opacity-70">·</span>
          <p className="text-xs" data-testid={`eft-row-status-${payment.id}`}>
            {payment.status}
          </p>
        </div>
        <p className="text-xs mt-1 leading-relaxed opacity-90">{config.description}</p>
        <p className="text-[10px] mt-2 opacity-60">
          {payment.package_name} · created {new Date(payment.created_at).toLocaleString()}
        </p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        {config.action && (
          <Button
            type="button"
            onClick={onReupload}
            size="sm"
            variant="outline"
            className="bg-white"
            data-testid={`eft-reupload-${payment.id}`}
          >
            {config.action}
          </Button>
        )}
        {canCancel && (
          <Button
            type="button"
            onClick={onCancel}
            size="sm"
            variant="ghost"
            className="text-xs"
            data-testid={`eft-cancel-${payment.id}`}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function EftPaymentDialog({
  open,
  onClose,
  pkg,
  companyId,
  existingPayment,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  pkg: PackageApi;
  companyId: string | null;
  existingPayment: EftPayment | null;
  onSubmitted: (payment: EftPayment) => void;
}) {
  const [bankDetails, setBankDetails] = useState<{
    bank_name: string;
    account_holder: string;
    account_number: string;
    branch_code: string;
    account_type: string;
  } | null>(null);
  const [payment, setPayment] = useState<EftPayment | null>(existingPayment);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdIdRef = useRef<string | null>(null);
  const hasRequestedRef = useRef(false);

  // reset when open
  useEffect(() => {
    if (!open) {
      hasRequestedRef.current = false;
      setPayment(null);
      setCreating(false);
      return;
    }
    // If opening for existing payment (re-upload flow), use it directly
    if (existingPayment) {
      setPayment(existingPayment);
      createdIdRef.current = null;
    } else if (hasRequestedRef.current) {
      // already requested in this open session (StrictMode double-invoke), keep current payment state
    } else {
      setPayment(null);
    }
    createdIdRef.current = existingPayment ? null : createdIdRef.current;

    // load bank details
    fetch("/api/eft/bank-details")
      .then((r) => r.json())
      .then((d) => setBankDetails(d as typeof bankDetails))
      .catch(() => setBankDetails(null));

    if (!existingPayment && pkg && companyId && !hasRequestedRef.current) {
      hasRequestedRef.current = true;
      setCreating(true);
      fetch("/api/eft/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookup_key: pkg.lookup_key, company_id: companyId }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const d = (await r.json().catch(() => ({}))) as { detail?: string };
            throw new Error(d.detail || "Could not start payment");
          }
          return r.json() as Promise<EftPayment>;
        })
        .then((data) => {
          setPayment(data);
          createdIdRef.current = data.id;
          onSubmitted(data);
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : "Could not start payment"))
        .finally(() => setCreating(false));
    }
  }, [open, existingPayment, pkg, companyId, onSubmitted]);

  const handleClose = async () => {
    const orphanId = createdIdRef.current;
    if (orphanId && payment?.status === "awaiting_proof") {
      try {
        await fetch(`/api/eft/request/${orphanId}`, { method: "DELETE" });
      } catch {
        // ignore
      }
    }
    createdIdRef.current = null;
    onClose();
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payment) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/eft/upload-proof/${payment.id}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(d.detail || "Upload failed");
      }
      const updated = (await res.json()) as EftPayment;
      setPayment(updated);
      createdIdRef.current = null; // no longer orphan
      toast.success("Proof uploaded — we'll verify and email you shortly");
      onSubmitted(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isSubmitted = payment?.status === "pending_review" || payment?.status === "confirmed";
  const amountFmt = payment ? payment.amount.toFixed(2) : "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto rounded-sm"
        data-testid="eft-payment-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {isSubmitted ? "Proof submitted" : "Pay by EFT"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-600">
            {pkg ? pkg.name : ""}
          </DialogDescription>
        </DialogHeader>

        {creating && (
          <div className="py-10 text-center text-sm text-zinc-500" data-testid="eft-creating">
            Preparing your reference…
          </div>
        )}

        {!creating && payment && !isSubmitted && (
          <div className="space-y-5" data-testid="eft-instructions">
            <div className="rounded-sm border border-teal-200 bg-teal-50 p-4">
              <p className="text-xs leading-relaxed text-teal-900">
                <strong>3 steps:</strong> 1) EFT the exact amount to the account below using the
                reference <strong>as shown</strong>. 2) Save your proof of payment (PDF or
                screenshot). 3) Upload it here. Credits are added within 1 business day after we
                verify the deposit.
              </p>
            </div>

            <div className="rounded-sm border border-zinc-200 divide-y divide-zinc-200">
              <Row
                label="Reference (required)"
                value={payment.reference}
                onCopy={() => copy("Reference", payment.reference)}
                mono
                highlight
                testId="eft-reference"
              />
              <Row
                label="Amount (type this manually)"
                value={`R${amountFmt}`}
                mono
                highlight
                testId="eft-amount"
              />
              {bankDetails && (
                <>
                  <Row label="Bank" value={bankDetails.bank_name} testId="eft-bank-name" />
                  <Row
                    label="Account holder"
                    value={bankDetails.account_holder}
                    testId="eft-account-holder"
                  />
                  <Row
                    label="Account number"
                    value={bankDetails.account_number}
                    onCopy={() => copy("Account number", bankDetails.account_number)}
                    mono
                    testId="eft-account-number"
                  />
                  <Row
                    label="Branch code"
                    value={bankDetails.branch_code}
                    onCopy={() => copy("Branch code", bankDetails.branch_code)}
                    mono
                    testId="eft-branch-code"
                  />
                  <Row
                    label="Account type"
                    value={bankDetails.account_type}
                    testId="eft-account-type"
                  />
                </>
              )}
              {!bankDetails && (
                <div className="px-4 py-3 text-xs text-zinc-500">Loading bank details…</div>
              )}
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={onFilePicked}
                className="sr-only"
                data-testid="eft-proof-file-input"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                size="lg"
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
                data-testid="eft-upload-proof-btn"
              >
                {uploading ? "Uploading…" : "Upload proof of payment"}
              </Button>
              <p className="mt-2 text-[11px] text-zinc-500 text-center">
                PDF, PNG, JPG or WEBP · max 10MB
              </p>
            </div>
          </div>
        )}

        {isSubmitted && payment && (
          <div className="space-y-4" data-testid="eft-submitted">
            <div className="rounded-sm border border-teal-200 bg-teal-50 p-5 text-center">
              <p className="text-3xl mb-2">✓</p>
              <p className="text-base font-semibold text-zinc-900">Proof received</p>
              <p className="mt-1 text-sm text-zinc-700">
                We&apos;ll verify your payment and email you at{" "}
                <span className="font-mono text-xs">{payment.user_email}</span> when credits are
                added — usually within 1 business day.
              </p>
              <p className="mt-4 text-xs text-zinc-500">
                Reference: <span className="font-mono text-zinc-900">{payment.reference}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500" data-testid="eft-submitted-status">
                Status: {payment.status}
              </p>
            </div>
            <Button
              onClick={handleClose}
              size="lg"
              variant="outline"
              className="w-full"
              data-testid="eft-close-btn"
            >
              Done
            </Button>
          </div>
        )}

        {!creating && payment?.status === "rejected" && (
          <div className="space-y-4" data-testid="eft-rejected">
            <div className="rounded-sm border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">Payment rejected</p>
              <p className="text-xs text-red-700 mt-1">{payment.reject_reason}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={onFilePicked}
              className="sr-only"
              data-testid="eft-proof-file-input"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              size="lg"
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
              data-testid="eft-upload-proof-btn"
            >
              {uploading ? "Uploading…" : "Re-upload proof"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  onCopy,
  mono,
  highlight,
  testId,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
  highlight?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
          {label}
        </p>
        <p
          data-testid={testId}
          className={`mt-1 text-sm ${mono ? "font-mono" : ""} ${highlight ? "font-bold text-zinc-900" : "text-zinc-800"} break-all`}
        >
          {value || "—"}
        </p>
      </div>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          data-testid={`${testId}-copy`}
          aria-label={`Copy ${label}`}
        >
          Copy
        </button>
      )}
    </div>
  );
}
