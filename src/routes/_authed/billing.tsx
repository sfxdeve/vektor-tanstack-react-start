import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  BanknoteIcon,
  CheckIcon,
  ClockIcon,
  StarIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReferralWidget } from "@/components/referral-widget";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiForm, apiGet, apiSend, type EftPayment } from "@/lib/api-client";
import {
  type PackageDto,
  companiesQuery,
  creditsQuery,
  myEftPaymentsQuery,
  packagesQuery,
} from "@/lib/queries";
import { useActiveCompany } from "@/hooks/use-active-company";
import { rolloverCapForCycleCredits, type BankDetails } from "@/lib/eft";

export const Route = createFileRoute("/_authed/billing")({
  component: BillingPage,
});

const SUPPORT_BY_LOOKUP: Record<string, string> = {
  tc_starter_monthly_v2: "Email support",
  tc_pro_monthly_v2: "Priority support",
  tc_scale_monthly_v2: "Dedicated support",
};

function BillingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const packagesQueryResult = useQuery(packagesQuery());
  const packages = packagesQueryResult.data?.packages ?? [];
  const companiesQueryResult = useQuery(companiesQuery());
  const companies = companiesQueryResult.data ?? [];
  const { company: selectedCompany, setSelectedId: setSelectedCompanyId } =
    useActiveCompany(companies);
  const [dialogPkg, setDialogPkg] = useState<PackageDto | null>(null);
  const [dialogExisting, setDialogExisting] = useState<EftPayment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const companyId = selectedCompany?.id;

  const creditsQueryResult = useQuery({ ...creditsQuery(companyId!), enabled: Boolean(companyId) });
  const myPaymentsQueryResult = useQuery(myEftPaymentsQuery());
  const myPayments = myPaymentsQueryResult.data?.payments ?? [];

  const cancelMutation = useMutation({
    mutationFn: (paymentId: string) => apiSend<void>("DELETE", `/api/eft/request/${paymentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myEftPaymentsQuery().queryKey }),
  });

  const openEftDialog = (pkg: PackageDto) => {
    if (!selectedCompany) {
      toast.error("Please create a company profile first");
      return;
    }
    setDialogExisting(null);
    setDialogPkg(pkg);
    setDialogOpen(true);
  };

  const reuploadForPayment = (payment: EftPayment) => {
    // Reconstruct the minimal package header for the dialog from the payment.
    const pkg: PackageDto = {
      id: payment.lookup_key,
      lookup_key: payment.lookup_key,
      name: payment.package_name,
      description: "",
      persona: null,
      tagline: null,
      amount: payment.amount,
      amount_cents: Math.round(payment.amount * 100),
      currency: "zar",
      credits: payment.credits,
      type: payment.type,
      interval: payment.billing_period === "monthly" ? "month" : null,
      is_popular: false,
      billing_period: payment.billing_period,
    };
    setDialogPkg(pkg);
    setDialogExisting(payment);
    setDialogOpen(true);
  };

  const refreshBillingData = () => {
    void queryClient.invalidateQueries({ queryKey: myEftPaymentsQuery().queryKey });
    if (companyId)
      void queryClient.invalidateQueries({ queryKey: creditsQuery(companyId).queryKey });
  };

  const closeDialog = () => {
    setDialogOpen(false);
    // delay clearing to allow the close animation
    setTimeout(() => {
      setDialogPkg(null);
      setDialogExisting(null);
    }, 200);
    refreshBillingData();
  };

  const handleCancel = async (payment: EftPayment) => {
    try {
      await cancelMutation.mutateAsync(payment.id);
      toast.success("Payment cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  };

  const billingBaseQueries = [packagesQueryResult, companiesQueryResult, myPaymentsQueryResult];
  if (billingBaseQueries.some((query) => query.isPending || query.isError)) {
    const failed = billingBaseQueries.some((query) => query.isError);
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {failed ? (
          <div className="text-center" data-testid="billing-load-error">
            <p className="text-sm text-red-600">Could not load billing data.</p>
            <Button
              data-testid="billing-retry"
              variant="outline"
              className="mt-4"
              onClick={() => void Promise.all(billingBaseQueries.map((query) => query.refetch()))}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Spinner className="h-6 w-6 text-zinc-400" />
        )}
      </div>
    );
  }

  if (!companies.length) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        <div className="text-center" data-testid="no-company-message">
          <p className="text-zinc-600 mb-4">No company profile found.</p>
          <Button data-testid="create-company-btn" onClick={() => void navigate({ to: "/setup" })}>
            Create Company Profile
          </Button>
        </div>
      </div>
    );
  }

  if (creditsQueryResult.isPending || creditsQueryResult.isError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {creditsQueryResult.isError ? (
          <div className="text-center" data-testid="billing-credits-error">
            <p className="text-sm text-red-600">Could not load your credit balance.</p>
            <Button
              data-testid="billing-credits-retry"
              variant="outline"
              className="mt-4"
              onClick={() => void creditsQueryResult.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Spinner className="h-6 w-6 text-zinc-400" />
        )}
      </div>
    );
  }

  const subscriptionPkgs = packages.filter((p) => p.type === "subscription");
  const paygPkgs = packages.filter((p) => p.type === "one_time");
  const currentCredits = creditsQueryResult.data?.credits ?? 0;
  const subscription = creditsQueryResult.data?.subscription ?? null;
  const subscriptionPlanName =
    subscription != null
      ? (packages.find((p) => p.lookup_key === subscription.lookup_key)?.name ??
        subscription.lookup_key)
      : null;
  // Show every non-confirmed payment — awaiting_proof, pending_review, rejected (spec: pending/awaiting can be listed, rejected allows re-upload)
  const activeEfts = myPayments.filter((p) => p.status !== "confirmed");

  return (
    <>
      <div className="flex-1 overflow-auto bg-zinc-50">
        <div className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <Button
            data-testid="back-btn"
            variant="ghost"
            onClick={() => void navigate({ to: "/app" })}
            className="-ml-2 mb-4"
          >
            <ArrowLeftIcon aria-hidden="true" />
            Back to Dashboard
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
            <Field className="mt-4 max-w-sm">
              <FieldLabel
                htmlFor="billing-company-select"
                className="text-xs font-semibold tracking-[0.1em] uppercase"
              >
                Company
              </FieldLabel>
              <Select
                items={companies.map((c) => ({ value: c.id, label: c.company_name }))}
                value={selectedCompany.id}
                onValueChange={(v) => setSelectedCompanyId(v as string)}
              >
                <SelectTrigger
                  id="billing-company-select"
                  data-testid="select-company"
                  aria-label="Select company"
                  className="mt-2 rounded-sm bg-white"
                >
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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
                {subscription?.active && (
                  <Badge
                    data-testid="active-subscription-badge"
                    className="rounded-sm border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white"
                  >
                    <CheckIcon aria-hidden="true" />
                    Active · {subscriptionPlanName}
                  </Badge>
                )}
              </div>
              {subscription?.active && subscription.rollover_cap != null && (
                <p className="mt-4 text-xs text-zinc-400" data-testid="rollover-cap-hint">
                  Rollover cap: {subscription.rollover_cap} credits
                  {currentCredits >= subscription.rollover_cap && (
                    <span className="ml-2 rounded-sm bg-zinc-800 px-2 py-0.5 font-semibold text-zinc-200">
                      At cap — use some to accrue more
                    </span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <ReferralWidget />

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
                    onCancel={() => void handleCancel(p)}
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
              <CheckIcon aria-hidden="true" className="text-teal-600 mt-0.5 shrink-0" />
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
                const rolloverCap = rolloverCapForCycleCredits(pkg.credits);
                const support = SUPPORT_BY_LOOKUP[pkg.lookup_key] ?? "Email support";
                return (
                  <Card
                    key={pkg.id}
                    data-testid={`package-${pkg.id}`}
                    className={`relative rounded-sm shadow-none ${pkg.is_popular ? "border-2 border-teal-600" : "border border-zinc-200"}`}
                  >
                    {pkg.is_popular && (
                      <Badge
                        render={
                          <div
                            data-testid={`popular-badge-${pkg.id}`}
                            className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm bg-teal-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white"
                          />
                        }
                      >
                        <StarIcon aria-hidden="true" />
                        Most Popular
                      </Badge>
                    )}
                    <CardHeader className="border-b border-zinc-200">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">Plan</p>
                      <CardTitle className="text-2xl font-bold">{pkg.name}</CardTitle>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-3xl font-bold">R{pkg.amount}</span>
                        <span className="text-sm text-zinc-500">/ month</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 leading-snug">{pkg.persona}</p>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <ul className="space-y-3 mb-6">
                        <li className="flex items-start gap-2 text-sm">
                          <CheckIcon
                            aria-hidden="true"
                            className="text-green-600 mt-0.5 shrink-0"
                          />
                          <span>
                            <strong>{pkg.credits}</strong> tender analyses / month
                          </span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <CheckIcon aria-hidden="true" className="text-teal-600 mt-0.5 shrink-0" />
                          <span>{pkg.tagline ?? "Full compliance suite"}</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <CheckIcon
                            aria-hidden="true"
                            className="text-green-600 mt-0.5 shrink-0"
                          />
                          <span>Full PDF audit report</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <CheckIcon
                            aria-hidden="true"
                            className="text-green-600 mt-0.5 shrink-0"
                          />
                          <span>{support}</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <CheckIcon aria-hidden="true" className="text-teal-600 mt-0.5 shrink-0" />
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
                        <CheckIcon aria-hidden="true" className="text-green-600 mt-0.5 shrink-0" />
                        <span>
                          <strong>{pkg.credits}</strong> tender analysis credit
                          {pkg.credits > 1 ? "s" : ""}
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <CheckIcon aria-hidden="true" className="text-teal-600 mt-0.5 shrink-0" />
                        <span>Credit never expires — use whenever you bid</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <CheckIcon aria-hidden="true" className="text-green-600 mt-0.5 shrink-0" />
                        <span>Full compliance suite — vault, SBD forms, alerts</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <CheckIcon aria-hidden="true" className="text-green-600 mt-0.5 shrink-0" />
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
      </div>

      {dialogPkg && (
        <EftPaymentDialog
          open={dialogOpen}
          onClose={closeDialog}
          pkg={dialogPkg}
          companyId={selectedCompany?.id ?? null}
          existingPayment={dialogExisting}
          onSubmitted={refreshBillingData}
        />
      )}
    </>
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
}) {
  const cfg: Record<
    string,
    {
      icon: React.ReactNode;
      iconColor: string;
      color: string;
      label: string;
      description: string;
      action: string | null;
    }
  > = {
    awaiting_proof: {
      icon: <ClockIcon aria-hidden="true" />,
      iconColor: "text-amber-600",
      color: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Awaiting proof",
      description: "You started a payment but haven't uploaded proof yet.",
      action: "Upload proof",
    },
    pending_review: {
      icon: <ClockIcon aria-hidden="true" />,
      iconColor: "text-teal-600",
      color: "border-teal-200 bg-teal-50 text-teal-700",
      label: "Verifying payment",
      description:
        "We received your proof of payment. Credits will be added within 1 business day.",
      action: null,
    },
    rejected: {
      icon: <XCircleIcon aria-hidden="true" />,
      iconColor: "text-red-600",
      color: "border-red-200 bg-red-50 text-red-700",
      label: "Rejected",
      description: payment.reject_reason || "Please re-upload proof of payment.",
      action: "Re-upload proof",
    },
    confirmed: {
      icon: <BadgeCheckIcon aria-hidden="true" />,
      iconColor: "text-green-600",
      color: "border-green-200 bg-green-50 text-green-700",
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
      className={`flex items-start gap-3 rounded-sm border p-4 ${config.color}`}
    >
      <span className={`mt-0.5 shrink-0 ${config.iconColor}`}>{config.icon}</span>
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
  pkg: PackageDto;
  companyId: string | null;
  existingPayment: EftPayment | null;
  onSubmitted: (payment: EftPayment) => void;
}) {
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [payment, setPayment] = useState<EftPayment | null>(existingPayment);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdIdRef = useRef<string | null>(null);
  const hasRequestedRef = useRef(false);

  // Reset when closed — the parent keeps this mounted for ~200ms so the close
  // animation can play; clear immediately so the fade-out shows a blank slate.
  /* oxlint-disable react/set-state-in-effect -- syncing with an external prop transition */
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
    apiGet<BankDetails>("/api/eft/bank-details")
      .then(setBankDetails)
      .catch(() => setBankDetails(null));

    if (!existingPayment && pkg && companyId && !hasRequestedRef.current) {
      hasRequestedRef.current = true;
      setCreating(true);
      apiSend<EftPayment>("POST", "/api/eft/request", {
        lookup_key: pkg.lookup_key,
        company_id: companyId,
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
  /* oxlint-enable react/set-state-in-effect */

  const handleClose = async () => {
    const orphanId = createdIdRef.current;
    if (orphanId && payment?.status === "awaiting_proof") {
      try {
        await apiSend("DELETE", `/api/eft/request/${orphanId}`);
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
      const updated = await apiForm<EftPayment>(`/api/eft/upload-proof/${payment.id}`, form);
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
              <Attachment
                state={uploading ? "uploading" : "idle"}
                className="w-full max-w-none rounded-sm"
              >
                <AttachmentMedia>
                  <BanknoteIcon aria-hidden="true" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>
                    {uploading ? "Uploading proof…" : "Upload proof of payment"}
                  </AttachmentTitle>
                  <AttachmentDescription>PDF, PNG, JPG or WEBP · max 10MB</AttachmentDescription>
                </AttachmentContent>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  size="sm"
                  className="bg-zinc-900 text-white hover:bg-zinc-800"
                  data-testid="eft-upload-proof-btn"
                >
                  Choose file
                </Button>
              </Attachment>
            </div>
          </div>
        )}

        {isSubmitted && payment && (
          <div className="space-y-4" data-testid="eft-submitted">
            <div className="rounded-sm border border-teal-200 bg-teal-50 p-5 text-center">
              <CheckIcon aria-hidden="true" className="mx-auto mb-2 h-8 w-8 text-teal-600" />
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
