// oxlint-disable react/set-state-in-effect
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useRequireUser } from "@/hooks/use-require-user";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function VerificationBadge({
  kind,
  value,
  testId,
}: {
  kind: string;
  value: string;
  testId: string;
}) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const val = (value || "").trim();
    if (!val) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/verify/statutory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, value: val }),
        });
        const data = await res.json();
        if (!cancelled) setResult(data as Record<string, unknown>);
      } catch {
        if (!cancelled)
          setResult({ valid: false, reason: "Verification service unavailable" } as Record<
            string,
            unknown
          >);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, value]);

  if (!result) return null;
  const r = result as {
    valid?: boolean;
    reason?: string;
    incorporation_year?: number;
    entity_type_label?: string;
    verify_url?: string;
    verify_url_label?: string;
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid={testId}>
      {r.valid ? (
        <span
          className="inline-flex items-center gap-1 font-semibold text-green-700"
          data-testid={`${testId}-valid`}
        >
          ● Valid format
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 font-semibold text-red-600"
          data-testid={`${testId}-invalid`}
        >
          ✕ {String(r.reason || "Invalid format")}
        </span>
      )}

      {r.valid && r.incorporation_year && (
        <span className="text-zinc-600" data-testid={`${testId}-year`}>
          Incorporation year:{" "}
          <span className="font-semibold text-zinc-900">{String(r.incorporation_year)}</span>
        </span>
      )}
      {r.valid && r.entity_type_label && (
        <span className="text-zinc-600" data-testid={`${testId}-entity`}>
          Type: <span className="font-semibold text-zinc-900">{String(r.entity_type_label)}</span>
        </span>
      )}

      {r.verify_url && (
        <a
          data-testid={`${testId}-link`}
          href={String(r.verify_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
        >
          {String(r.verify_url_label || "Open official portal")} ↗
        </a>
      )}
    </div>
  );
}

function BargainingCouncilMultiSelect({
  catalog,
  selected,
  onToggle,
  onClear,
}: {
  catalog: Array<{
    code: string;
    name: string;
    scope: string;
    sectors: string[];
    cidb_classes: string[];
    regions?: string[];
    website?: string | null;
  }>;
  selected: string[];
  onToggle: (code: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = new Set(selected || []);
  const selectedCatalog = (catalog || []).filter((c) => selectedSet.has(c.code));
  const isEmpty = selectedCatalog.length === 0;
  const noCatalog = !catalog || catalog.length === 0;
  const filtered = (catalog || []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.code} ${c.name} ${(c.sectors || []).join(" ")}`.toLowerCase().includes(q);
  });

  return (
    <div className="mt-3" data-testid="bc-multiselect">
      <button
        type="button"
        data-testid="bc-multiselect-trigger"
        disabled={noCatalog}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[42px] w-full items-center gap-2 rounded-sm border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400 focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {isEmpty ? (
            <span className="text-zinc-500">
              {noCatalog ? "Loading councils…" : "Select councils"}
            </span>
          ) : (
            selectedCatalog.map((c) => (
              <span
                key={c.code}
                data-testid={`bc-chip-${c.code}`}
                className="inline-flex items-center gap-1 rounded-sm bg-zinc-900 px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] text-white uppercase"
                title={c.name}
              >
                {c.code.replace(/_/g, " ")}
                <button
                  type="button"
                  aria-label={`Remove ${c.code}`}
                  data-testid={`bc-chip-remove-${c.code}`}
                  className="-mr-0.5 inline-flex items-center justify-center rounded-sm p-0.5 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(c.code);
                  }}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
        <span className="shrink-0 text-zinc-500">▼</span>
      </button>
      {open && (
        <div className="mt-2 rounded-sm border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-2">
            <Input
              placeholder="Search councils…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="bc-multiselect-search"
              className="rounded-sm"
            />
          </div>
          <div className="max-h-64 overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-zinc-500">No councils match that search.</div>
            ) : (
              filtered.map((c) => {
                const checked = selectedSet.has(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    data-testid={`bc-option-${c.code}`}
                    className="flex w-full items-start gap-3 rounded-sm p-2 text-left hover:bg-zinc-50"
                    onClick={() => onToggle(c.code)}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${checked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"}`}
                      aria-hidden
                    >
                      {checked && <span className="text-[10px]">✓</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tracking-[0.08em] text-zinc-900 uppercase">
                          {c.code.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-semibold tracking-[0.1em] text-zinc-500 uppercase">
                          {c.scope}
                        </span>
                      </div>
                      <div className="text-xs leading-snug text-zinc-700">{c.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {(c.sectors || []).join(" · ")}
                        {c.regions && c.regions.length > 0 ? ` — ${c.regions.join(", ")}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {selectedCatalog.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          data-testid="bc-multiselect-clear"
          className="mt-2 text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase transition-colors hover:text-zinc-900"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const { session, isPending } = useRequireUser();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Array<Record<string, unknown>>>([]);
  const [formData, setFormData] = useState({
    company_name: "",
    cipc_num: "",
    csd_maaa_num: "",
    sars_tcs_pin: "",
    cidb_crs_num: "",
    bbbee_level: "",
    contact_email: "",
    contact_phone: "",
    authorised_signatory_name: "",
    authorised_signatory_position: "",
    bargaining_councils: [] as string[],
    preferred_pppfa_system: "",
    alerts_enabled: true,
  });
  const [councilCatalog, setCouncilCatalog] = useState<
    Array<{
      code: string;
      name: string;
      scope: string;
      sectors: string[];
      cidb_classes: string[];
      regions?: string[];
      website?: string | null;
    }>
  >([]);

  const selectedCompany = companies[0] as Record<string, unknown> | undefined;
  const isEditing = Boolean(selectedCompany?.id);

  useRequireUser();

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    fetch("/api/reference/bargaining-councils")
      .then((r) => r.json())
      .then((d) => setCouncilCatalog((d as { councils: typeof councilCatalog }).councils || []))
      .catch(() => setCouncilCatalog([]));
  }, []);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);
      })
      .catch(() => setCompanies([]));
  }, [session]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!selectedCompany) return;
    setFormData({
      company_name: (selectedCompany.company_name as string) || "",
      cipc_num: (selectedCompany.cipc_num as string) || "",
      csd_maaa_num: (selectedCompany.csd_maaa_num as string) || "",
      sars_tcs_pin: (selectedCompany.sars_tcs_pin as string) || "",
      cidb_crs_num: (selectedCompany.cidb_crs_num as string) || "",
      bbbee_level:
        selectedCompany.bbbee_level != null ? String(selectedCompany.bbbee_level as string) : "",
      contact_email: (selectedCompany.contact_email as string) || "",
      contact_phone: (selectedCompany.contact_phone as string) || "",
      authorised_signatory_name: (selectedCompany.authorised_signatory_name as string) || "",
      authorised_signatory_position:
        (selectedCompany.authorised_signatory_position as string) || "",
      bargaining_councils: Array.isArray(selectedCompany.bargaining_councils)
        ? (selectedCompany.bargaining_councils as string[])
        : [],
      preferred_pppfa_system: (selectedCompany.preferred_pppfa_system as string) || "",
      alerts_enabled: selectedCompany.alerts_enabled !== false,
    });
  }, [selectedCompany]);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }) as typeof prev);
  };

  const toggleCouncil = (code: string) => {
    setFormData((prev) => {
      const set = new Set(prev.bargaining_councils || []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...prev, bargaining_councils: Array.from(set) };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.cipc_num) {
      toast.error("Company name and CIPC number are required");
      return;
    }
    setLoading(true);
    try {
      const nullIfBlank = (v: string) => (typeof v === "string" && v.trim() === "" ? null : v);
      const payload: Record<string, unknown> = {
        company_name: formData.company_name.trim(),
        cipc_num: formData.cipc_num.trim(),
        csd_maaa_num: nullIfBlank(formData.csd_maaa_num),
        sars_tcs_pin: nullIfBlank(formData.sars_tcs_pin),
        cidb_crs_num: nullIfBlank(formData.cidb_crs_num),
        bbbee_level: formData.bbbee_level ? Number.parseInt(formData.bbbee_level, 10) : null,
        contact_email: nullIfBlank(formData.contact_email),
        contact_phone: nullIfBlank(formData.contact_phone),
        authorised_signatory_name: nullIfBlank(formData.authorised_signatory_name),
        authorised_signatory_position: nullIfBlank(formData.authorised_signatory_position),
        bargaining_councils: formData.bargaining_councils || [],
        preferred_pppfa_system: nullIfBlank(formData.preferred_pppfa_system),
        alerts_enabled: Boolean(formData.alerts_enabled),
      };

      if (isEditing && selectedCompany) {
        const res = await fetch(`/api/companies/${String(selectedCompany.id as string)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { detail?: string }).detail || "Failed to update profile");
        }
        const updated = await res.json();
        setCompanies([updated as Record<string, unknown>]);
        toast.success("Company profile updated");
      } else {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { detail?: string }).detail || "Failed to create company profile",
          );
        }
        const created = await res.json();
        setCompanies([created as Record<string, unknown>]);
        toast.success("Company profile created successfully!");
        setTimeout(() => void navigate({ to: "/app" }), 1200);
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : isEditing
            ? "Failed to update profile"
            : "Failed to create company profile";
      toast.error(msg);
    } finally {
      setLoading(false);
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

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
      <ImpersonationBanner />
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <Button
            data-testid="back-btn"
            variant="ghost"
            onClick={() => void navigate({ to: "/app" })}
            className="-ml-2 mb-4"
          >
            ← Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            {isEditing ? "Company Profile" : "Company Profile Setup"}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 sm:text-base">
            {isEditing
              ? "Edit your company details, statutory numbers and Compliance Guardian settings."
              : "Configure your company's statutory credentials and compliance information"}
          </p>
        </div>

        <div className="max-w-3xl p-4 sm:p-8">
          <Card className="rounded-sm border-zinc-200 shadow-none" data-testid="company-form-card">
            <CardHeader className="border-b border-zinc-200">
              <CardTitle className="text-xl font-bold">Statutory Vault Details</CardTitle>
              <CardDescription>
                Enter your company&apos;s compliance credentials. We validate the format as you type
                and link you to the official verification portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label
                    htmlFor="company_name"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    Company Name *
                  </Label>
                  <Input
                    id="company_name"
                    data-testid="input-company-name"
                    value={formData.company_name}
                    onChange={(e) => handleChange("company_name", e.target.value)}
                    placeholder="e.g. Amandla Construction (Pty) Ltd"
                    className="mt-2 rounded-sm"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label
                      htmlFor="cipc_num"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      CIPC Registration Number *
                    </Label>
                    <Input
                      id="cipc_num"
                      data-testid="input-cipc-num"
                      value={formData.cipc_num}
                      onChange={(e) => handleChange("cipc_num", e.target.value)}
                      placeholder="e.g. 2021/123456/07"
                      className="mt-2 rounded-sm"
                      required
                    />
                    <VerificationBadge kind="cipc" value={formData.cipc_num} testId="verify-cipc" />
                  </div>

                  <div>
                    <Label
                      htmlFor="csd_maaa_num"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      CSD/MAAA Number
                    </Label>
                    <Input
                      id="csd_maaa_num"
                      data-testid="input-csd-num"
                      value={formData.csd_maaa_num}
                      onChange={(e) => handleChange("csd_maaa_num", e.target.value)}
                      placeholder="e.g. MAAA0123456"
                      className="mt-2 rounded-sm"
                    />
                    <VerificationBadge
                      kind="csd"
                      value={formData.csd_maaa_num}
                      testId="verify-csd"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label
                      htmlFor="sars_tcs_pin"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      SARS TCS PIN
                    </Label>
                    <Input
                      id="sars_tcs_pin"
                      data-testid="input-sars-pin"
                      value={formData.sars_tcs_pin}
                      onChange={(e) => handleChange("sars_tcs_pin", e.target.value)}
                      placeholder="10-char alphanumeric PIN"
                      className="mt-2 rounded-sm"
                    />
                    <VerificationBadge
                      kind="sars"
                      value={formData.sars_tcs_pin}
                      testId="verify-sars"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="cidb_crs_num"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      CIDB Grades
                    </Label>
                    <Input
                      id="cidb_crs_num"
                      data-testid="input-cidb-grade"
                      value={formData.cidb_crs_num}
                      onChange={(e) => handleChange("cidb_crs_num", e.target.value)}
                      placeholder="e.g. 4EB, 3GB, 6CE"
                      className="mt-2 rounded-sm"
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                      List every registration you hold, comma-separated. A higher grade
                      automatically covers lower grades in the same class (e.g. 6CE qualifies for
                      1CE–6CE tenders).
                    </p>
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor="bbbee_level"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    B-BBEE Level
                  </Label>
                  <Select
                    onValueChange={(value) => handleChange("bbbee_level", value)}
                    value={formData.bbbee_level}
                  >
                    <SelectTrigger
                      data-testid="select-bbbee-level"
                      aria-label="B-BBEE Level"
                      className="mt-2 rounded-sm"
                    >
                      <SelectValue placeholder="Select B-BBEE Level" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                        <SelectItem key={level} value={String(level)}>
                          Level {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div data-testid="preferred-pppfa-section">
                  <Label
                    htmlFor="preferred_pppfa_system"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    Default PPPFA Preference System
                  </Label>
                  <Select
                    onValueChange={(value) => handleChange("preferred_pppfa_system", value)}
                    value={formData.preferred_pppfa_system}
                  >
                    <SelectTrigger
                      data-testid="select-preferred-pppfa"
                      aria-label="Default PPPFA Preference System"
                      className="mt-2 rounded-sm"
                    >
                      <SelectValue placeholder="Select preference system" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80/20">80/20 System (Standard, up to R50m)</SelectItem>
                      <SelectItem value="90/10">90/10 System (Above R50m)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    Used as the default on every tender analysis. You can still override it on a
                    specific tender if the RFP calls for the other system.
                  </p>
                </div>

                <div data-testid="bargaining-councils-section">
                  <Label className="text-xs font-semibold tracking-[0.1em] uppercase">
                    Bargaining Councils I&apos;m registered with
                  </Label>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    Pick every council you hold a current Letter of Good Standing with. Vektor
                    cross-checks these against each tender&apos;s applicable council so you know
                    when a Letter is missing before you bid.
                  </p>
                  <BargainingCouncilMultiSelect
                    catalog={councilCatalog}
                    selected={formData.bargaining_councils || []}
                    onToggle={toggleCouncil}
                    onClear={() => setFormData((prev) => ({ ...prev, bargaining_councils: [] }))}
                  />
                </div>

                <div
                  className="grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 md:grid-cols-2"
                  data-testid="authorised-signatory-section"
                >
                  <div className="md:col-span-2 -mb-1">
                    <h2 className="text-base font-bold">Authorised Signatory</h2>
                    <p className="mt-1 text-xs text-zinc-600">
                      Auto-populated onto the Name and Position lines of every SBD form you
                      download. Leave blank to sign by hand.
                    </p>
                  </div>
                  <div>
                    <Label
                      htmlFor="authorised_signatory_name"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      Name of Authorised Signatory
                    </Label>
                    <Input
                      id="authorised_signatory_name"
                      data-testid="input-authorised-signatory-name"
                      value={formData.authorised_signatory_name}
                      onChange={(e) => handleChange("authorised_signatory_name", e.target.value)}
                      placeholder="e.g. John Ndlovu"
                      className="mt-2 rounded-sm"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="authorised_signatory_position"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      Position
                    </Label>
                    <Input
                      id="authorised_signatory_position"
                      data-testid="input-authorised-signatory-position"
                      value={formData.authorised_signatory_position}
                      onChange={(e) =>
                        handleChange("authorised_signatory_position", e.target.value)
                      }
                      placeholder="e.g. Managing Director"
                      className="mt-2 rounded-sm"
                    />
                  </div>
                </div>

                <div
                  className="border-t border-zinc-200 pt-2"
                  data-testid="compliance-guardian-section"
                >
                  <div className="flex items-start justify-between gap-4 pt-6">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-teal-700">
                        <span className="text-white">🔔</span>
                      </div>
                      <div>
                        <h2 className="text-base font-bold">Compliance Guardian</h2>
                        <p className="mt-1 max-w-md text-xs text-zinc-600">
                          Get an email 30 days, 7 days and on the day a compliance document expires
                          — even when you&apos;re not logged in.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        data-testid="alerts-enabled-toggle"
                        checked={formData.alerts_enabled}
                        onChange={(e) => handleChange("alerts_enabled", e.target.checked)}
                        aria-label="Enable expiry alerts"
                        className="h-4 w-4"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label
                        htmlFor="contact_email"
                        className="text-xs font-semibold tracking-[0.1em] uppercase"
                      >
                        Contact Email
                      </Label>
                      <div className="relative mt-2">
                        <Input
                          id="contact_email"
                          data-testid="input-contact-email"
                          type="email"
                          value={formData.contact_email}
                          onChange={(e) => handleChange("contact_email", e.target.value)}
                          placeholder="alerts@yourcompany.co.za"
                          className="rounded-sm pl-9"
                          disabled={!formData.alerts_enabled}
                        />
                      </div>
                    </div>
                    <div>
                      <Label
                        htmlFor="contact_phone"
                        className="text-xs font-semibold tracking-[0.1em] uppercase"
                      >
                        Contact Phone (WhatsApp — coming soon)
                      </Label>
                      <div className="relative mt-2">
                        <Input
                          id="contact_phone"
                          data-testid="input-contact-phone"
                          value={formData.contact_phone}
                          onChange={(e) => handleChange("contact_phone", e.target.value)}
                          placeholder="+27 82 123 4567"
                          className="rounded-sm pl-9"
                          disabled={!formData.alerts_enabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    data-testid="submit-company-btn"
                    type="submit"
                    disabled={loading}
                    size="lg"
                    className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    {loading
                      ? isEditing
                        ? "Saving..."
                        : "Creating Profile..."
                      : isEditing
                        ? "Save Changes"
                        : "Create Company Profile"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
