import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, BellIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { apiSend } from "@/lib/api-client";
import type { Company } from "@/lib/api-client";
import { companiesQuery, councilsQuery } from "@/lib/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authed/setup")({
  component: SetupPage,
});

interface VerifyResultDto {
  valid?: boolean;
  reason?: string;
  incorporation_year?: number;
  entity_type_label?: string;
  verify_url?: string;
  verify_url_label?: string;
}

async function verifyStatutory(kind: string, value: string): Promise<VerifyResultDto> {
  return apiSend<VerifyResultDto>("POST", "/api/verify/statutory", { kind, value });
}

/** Debounced live format validation with a deep-link to the official portal. */
function VerificationBadge({
  kind,
  value,
  testId,
}: {
  kind: string;
  value: string;
  testId: string;
}) {
  const trimmed = (value || "").trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), 350);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const enabled = Boolean(kind && debounced);
  const query = useQuery({
    queryKey: ["verify", kind, debounced],
    queryFn: () => verifyStatutory(kind, debounced),
    enabled,
    retry: false,
  });

  if (!enabled) return null;
  const r = query.data;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid={testId}>
      {r ? (
        r.valid ? (
          <span
            className="inline-flex items-center gap-1 font-semibold text-green-700"
            data-testid={`${testId}-valid`}
          >
            <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Valid format
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 font-semibold text-red-600"
            data-testid={`${testId}-invalid`}
          >
            <XCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {String(r.reason || "Invalid format")}
          </span>
        )
      ) : null}

      {r?.valid && r.incorporation_year ? (
        <span className="text-zinc-600" data-testid={`${testId}-year`}>
          Incorporation year:{" "}
          <span className="font-semibold text-zinc-900">{String(r.incorporation_year)}</span>
        </span>
      ) : null}
      {r?.valid && r.entity_type_label ? (
        <span className="text-zinc-600" data-testid={`${testId}-entity`}>
          Type: <span className="font-semibold text-zinc-900">{String(r.entity_type_label)}</span>
        </span>
      ) : null}

      {r?.verify_url ? (
        <HoverCard>
          <HoverCardTrigger
            render={
              <a
                data-testid={`${testId}-link`}
                href={String(r.verify_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
              >
                {String(r.verify_url_label || "Open official portal")}
              </a>
            }
          />
          <HoverCardContent className="w-64 rounded-sm text-xs">
            Opens the official register in a new tab so you can confirm this number before bidding.
          </HoverCardContent>
        </HoverCard>
      ) : null}
    </div>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const councilsAnchor = useComboboxAnchor();
  const companiesQueryResult = useQuery(companiesQuery());
  const councilsQueryResult = useQuery(councilsQuery());
  const councilCatalog = councilsQueryResult.data?.councils ?? [];
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
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
  const companies = companiesQueryResult.data ?? [];
  const selectedCompany = companies[0];
  const isEditing = Boolean(selectedCompany?.id);
  const [seededFromId, setSeededFromId] = useState<string | null>(null);

  // Seed the form from the loaded company once per company identity —
  // render-phase adjustment (the documented React pattern for resetting
  // editable state when its source changes), so no effect churn is needed.
  if (selectedCompany && selectedCompany.id !== seededFromId) {
    setSeededFromId(selectedCompany.id);
    setFormData({
      company_name: selectedCompany.company_name,
      cipc_num: selectedCompany.cipc_num,
      csd_maaa_num: selectedCompany.csd_maaa_num ?? "",
      sars_tcs_pin: selectedCompany.sars_tcs_pin ?? "",
      cidb_crs_num: selectedCompany.cidb_crs_num ?? "",
      bbbee_level: selectedCompany.bbbee_level != null ? String(selectedCompany.bbbee_level) : "",
      contact_email: selectedCompany.contact_email ?? "",
      contact_phone: selectedCompany.contact_phone ?? "",
      authorised_signatory_name: selectedCompany.authorised_signatory_name ?? "",
      authorised_signatory_position: selectedCompany.authorised_signatory_position ?? "",
      bargaining_councils: selectedCompany.bargaining_councils,
      preferred_pppfa_system: selectedCompany.preferred_pppfa_system ?? "",
      alerts_enabled: selectedCompany.alerts_enabled,
    });
  }

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }) as typeof prev);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEditing && selectedCompany
        ? apiSend<Company>("PATCH", `/api/companies/${selectedCompany.id}`, payload)
        : apiSend<Company>("POST", "/api/companies", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companiesQuery().queryKey });
    },
  });

  const handleSendTestAlert = async () => {
    if (!isEditing || !selectedCompany) {
      toast.error("Save the company first, then send a test alert.");
      return;
    }
    if (!formData.contact_email) {
      toast.error("Add a contact email before sending a test alert.");
      return;
    }
    setSendingTest(true);
    try {
      await saveMutation.mutateAsync({
        company_name: formData.company_name.trim(),
        cipc_num: formData.cipc_num.trim(),
        contact_email: formData.contact_email.trim() || null,
        contact_phone: formData.contact_phone.trim() || null,
        alerts_enabled: Boolean(formData.alerts_enabled),
      });
      const result = await apiSend<{ status?: string; to?: string; resendId?: string }>(
        "POST",
        `/api/reminders/test/${selectedCompany.id}`,
      );
      if (result.status === "sent") {
        toast.success(`Test reminder sent to ${result.to ?? formData.contact_email}`, {
          description: result.resendId ? `Delivery id: ${result.resendId}` : undefined,
        });
      } else {
        toast.error("Test send returned no delivery id — check the reminder configuration.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test alert");
    } finally {
      setSendingTest(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.cipc_num) {
      toast.error("Company name and CIPC number are required");
      return;
    }
    setSaving(true);
    const nullIfBlank = (v: string) => (typeof v === "string" && v.trim() === "" ? null : v);
    const payload = {
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
    try {
      await saveMutation.mutateAsync(payload);
      if (isEditing) {
        toast.success("Company profile updated");
      } else {
        toast.success("Company profile created successfully!");
        setTimeout(() => void navigate({ to: "/app" }), 1200);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Failed to update profile"
            : "Failed to create company profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const setupQueries = [companiesQueryResult, councilsQueryResult];
  if (setupQueries.some((query) => query.isPending || query.isError)) {
    const failed = setupQueries.some((query) => query.isError);
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {failed ? (
          <div className="text-center" data-testid="setup-load-error">
            <p className="text-sm text-red-600">Could not load your company profile.</p>
            <Button
              data-testid="setup-retry"
              variant="outline"
              className="mt-4"
              onClick={() => void Promise.all(setupQueries.map((query) => query.refetch()))}
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

  return (
    <div className="flex-1 overflow-auto">
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
              <FieldSet>
                <FieldLegend className="sr-only">Company identity</FieldLegend>
                <FieldGroup>
                  <Field>
                    <FieldLabel
                      htmlFor="company_name"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      Company Name *
                    </FieldLabel>
                    <Input
                      id="company_name"
                      data-testid="input-company-name"
                      value={formData.company_name}
                      onChange={(e) => handleChange("company_name", e.target.value)}
                      placeholder="e.g. Amandla Construction (Pty) Ltd"
                      className="rounded-sm"
                      required
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel
                    htmlFor="cipc_num"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    CIPC Registration Number *
                  </FieldLabel>
                  <Input
                    id="cipc_num"
                    data-testid="input-cipc-num"
                    value={formData.cipc_num}
                    onChange={(e) => handleChange("cipc_num", e.target.value)}
                    placeholder="e.g. 2021/123456/07"
                    className="rounded-sm"
                    required
                  />
                  <VerificationBadge kind="cipc" value={formData.cipc_num} testId="verify-cipc" />
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="csd_maaa_num"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    CSD/MAAA Number
                  </FieldLabel>
                  <Input
                    id="csd_maaa_num"
                    data-testid="input-csd-num"
                    value={formData.csd_maaa_num}
                    onChange={(e) => handleChange("csd_maaa_num", e.target.value)}
                    placeholder="e.g. MAAA0123456"
                    className="rounded-sm"
                  />
                  <VerificationBadge kind="csd" value={formData.csd_maaa_num} testId="verify-csd" />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel
                    htmlFor="sars_tcs_pin"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    SARS TCS PIN
                  </FieldLabel>
                  <Input
                    id="sars_tcs_pin"
                    data-testid="input-sars-pin"
                    value={formData.sars_tcs_pin}
                    onChange={(e) => handleChange("sars_tcs_pin", e.target.value)}
                    placeholder="10-char alphanumeric PIN"
                    className="rounded-sm"
                  />
                  <VerificationBadge
                    kind="sars"
                    value={formData.sars_tcs_pin}
                    testId="verify-sars"
                  />
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="cidb_crs_num"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    CIDB Grades
                  </FieldLabel>
                  <Input
                    id="cidb_crs_num"
                    data-testid="input-cidb-grade"
                    value={formData.cidb_crs_num}
                    onChange={(e) => handleChange("cidb_crs_num", e.target.value)}
                    placeholder="e.g. 4EB, 3GB, 6CE"
                    className="rounded-sm"
                  />
                  <FieldDescription>
                    List every registration you hold, comma-separated. A higher grade automatically
                    covers lower grades in the same class (e.g. 6CE qualifies for 1CE–6CE tenders).
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel
                  htmlFor="bbbee_level"
                  className="text-xs font-semibold tracking-[0.1em] uppercase"
                >
                  B-BBEE Level
                </FieldLabel>
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
              </Field>

              <Field data-testid="preferred-pppfa-section">
                <FieldLabel
                  htmlFor="preferred_pppfa_system"
                  className="text-xs font-semibold tracking-[0.1em] uppercase"
                >
                  Default PPPFA Preference System
                </FieldLabel>
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
                <FieldDescription>
                  Used as the default on every tender analysis. You can still override it on a
                  specific tender if the RFP calls for the other system.
                </FieldDescription>
              </Field>

              <div data-testid="bargaining-councils-section">
                {/* Section heading, not a form label — the combobox trigger
                      carries its own accessible name via ariaLabel. */}
                <p className="text-xs font-semibold tracking-[0.1em] uppercase">
                  Bargaining Councils I&apos;m registered with
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                  Pick every council you hold a current Letter of Good Standing with. Vektor
                  cross-checks these against each tender&apos;s applicable council so you know when
                  a Letter is missing before you bid.
                </p>
                <Combobox
                  items={councilCatalog.map((council) => council.code)}
                  multiple
                  value={formData.bargaining_councils}
                  onValueChange={(value) => handleChange("bargaining_councils", value)}
                >
                  <ComboboxChips
                    ref={councilsAnchor}
                    className="mt-3 min-h-[42px] rounded-sm bg-white"
                    data-testid="bc-multiselect"
                  >
                    <ComboboxValue>
                      {(values: string[]) =>
                        values.map((value) => (
                          <ComboboxChip
                            key={value}
                            data-testid={`bc-chip-${value}`}
                            aria-label={value.replace(/_/g, " ")}
                            removeLabel={`Remove ${value.replace(/_/g, " ")}`}
                            removeTestId={`bc-chip-remove-${value}`}
                          >
                            {value.replace(/_/g, " ")}
                          </ComboboxChip>
                        ))
                      }
                    </ComboboxValue>
                    <ComboboxChipsInput
                      aria-label="Bargaining Councils I'm registered with"
                      placeholder="Search councils…"
                      data-testid="bc-multiselect-trigger"
                    />
                  </ComboboxChips>
                  <ComboboxContent anchor={councilsAnchor} data-testid="bc-multiselect-content">
                    <ComboboxEmpty>No councils match that search.</ComboboxEmpty>
                    <ComboboxList aria-label="Bargaining councils">
                      {councilCatalog.map((council) => (
                        <ComboboxItem
                          key={council.code}
                          value={council.code}
                          data-testid={`bc-multiselect-option-${council.code}`}
                          className="items-start py-2 text-zinc-950 data-highlighted:bg-zinc-100 data-highlighted:text-zinc-950 data-highlighted:**:text-zinc-950"
                        >
                          <span className="flex flex-col">
                            <span className="text-xs font-bold tracking-[0.08em] uppercase">
                              {council.code.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-600 uppercase">
                              {[council.scope, ...council.sectors].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>

              <div
                className="grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 md:grid-cols-2"
                data-testid="authorised-signatory-section"
              >
                <div className="md:col-span-2 -mb-1">
                  <h2 className="text-base font-bold">Authorised Signatory</h2>
                  <p className="mt-1 text-xs text-zinc-600">
                    Auto-populated onto the Name and Position lines of every SBD form you download.
                    Leave blank to sign by hand.
                  </p>
                </div>
                <Field>
                  <FieldLabel
                    htmlFor="authorised_signatory_name"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    Name of Authorised Signatory
                  </FieldLabel>
                  <Input
                    id="authorised_signatory_name"
                    data-testid="input-authorised-signatory-name"
                    value={formData.authorised_signatory_name}
                    onChange={(e) => handleChange("authorised_signatory_name", e.target.value)}
                    placeholder="e.g. John Ndlovu"
                    className="rounded-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="authorised_signatory_position"
                    className="text-xs font-semibold tracking-[0.1em] uppercase"
                  >
                    Position
                  </FieldLabel>
                  <Input
                    id="authorised_signatory_position"
                    data-testid="input-authorised-signatory-position"
                    value={formData.authorised_signatory_position}
                    onChange={(e) => handleChange("authorised_signatory_position", e.target.value)}
                    placeholder="e.g. Managing Director"
                    className="rounded-sm"
                  />
                </Field>
              </div>

              <div
                className="border-t border-zinc-200 pt-2"
                data-testid="compliance-guardian-section"
              >
                <div className="flex items-start justify-between gap-4 pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-teal-700 text-white">
                      <BellIcon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold">Compliance Guardian</h2>
                      <p className="mt-1 max-w-md text-xs text-zinc-600">
                        Get an email 30 days, 7 days and on the day a compliance document expires —
                        even when you&apos;re not logged in.
                      </p>
                    </div>
                  </div>
                  <Switch
                    data-testid="alerts-enabled-toggle"
                    aria-label="Enable expiry alerts"
                    checked={formData.alerts_enabled}
                    onCheckedChange={(checked) => handleChange("alerts_enabled", checked === true)}
                  />
                </div>
                {isEditing && (
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="send-test-alert-btn"
                      disabled={sendingTest || !formData.contact_email || !formData.alerts_enabled}
                      onClick={() => void handleSendTestAlert()}
                    >
                      {sendingTest ? "Sending..." : "Send test alert"}
                    </Button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel
                      htmlFor="contact_email"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      Contact Email
                    </FieldLabel>
                    <Input
                      id="contact_email"
                      data-testid="input-contact-email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => handleChange("contact_email", e.target.value)}
                      placeholder="alerts@yourcompany.co.za"
                      className="rounded-sm"
                      disabled={!formData.alerts_enabled}
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor="contact_phone"
                      className="text-xs font-semibold tracking-[0.1em] uppercase"
                    >
                      Contact Phone (WhatsApp — coming soon)
                    </FieldLabel>
                    <Input
                      id="contact_phone"
                      data-testid="input-contact-phone"
                      value={formData.contact_phone}
                      onChange={(e) => handleChange("contact_phone", e.target.value)}
                      placeholder="+27 82 123 4567"
                      className="rounded-sm"
                      disabled={!formData.alerts_enabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  data-testid="submit-company-btn"
                  type="submit"
                  disabled={saving}
                  size="lg"
                  className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {saving
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
    </div>
  );
}
