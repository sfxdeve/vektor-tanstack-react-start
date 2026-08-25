import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  FileDownIcon,
  FileTextIcon,
  PaperclipIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GoNoGoGauge } from "@/components/gonogo-gauge";

import { apiForm, apiSend, type ReturnableState } from "@/lib/api-client";
import { verdictFromScore } from "@/lib/tender-scoring";
import { companiesQuery, tendersQuery } from "@/lib/queries";
import { downloadAuthenticatedFile } from "@/lib/download";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/_authed/analyze")({
  component: AnalyzePage,
});

interface TenderResult {
  tender_id: string;
  tender_title: string;
  required_cidb: string | null;
  mandatory_returnables: string[];
  evaluation_criteria?: string[];
  fit_score: number;
  risk_flags: string[];
  eligible_bbbee_points: number;
  closing_date: string | null;
  returnable_status: Record<
    string,
    { verified: boolean; verified_at: string | null; doc_ref: string | null }
  >;
  verdict?: string;
  id?: string;
}

function AnalyzePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companiesQueryResult = useQuery(companiesQuery());
  const companies = companiesQueryResult.data ?? [];
  const {
    company: selectedCompany,
    selectedId: selectedCompanyId,
    setSelectedId,
  } = useActiveCompany(companies);
  const [preferenceSystem, setPreferenceSystem] = useState("80/20");
  const [preferenceSeededFromId, setPreferenceSeededFromId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TenderResult | null>(null);
  const [returnableStatus, setReturnableStatus] = useState<Record<string, ReturnableState>>({});

  // Seed / re-seed the PPPFA default whenever the active company changes
  // (render-phase adjustment — the documented React pattern for resetting
  // editable state when its source changes).
  if (selectedCompany && selectedCompany.id !== preferenceSeededFromId) {
    setPreferenceSeededFromId(selectedCompany.id);
    setPreferenceSystem(selectedCompany.preferred_pppfa_system ?? "80/20");
  }

  const companyId = selectedCompany?.id;
  const tendersQueryResult = useQuery({ ...tendersQuery(companyId!), enabled: Boolean(companyId) });
  const tenderList = tendersQueryResult.data ?? [];

  const analyzeMutation = useMutation({
    mutationFn: (form: FormData) => apiForm<TenderResult>("/api/tenders/analyze", form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tendersQuery(companyId!).queryKey }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    if (selectedFile && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      e.target.value = "";
      return;
    }
    setFile(selectedFile);
  };

  async function handleAnalyze() {
    if (!file || !selectedCompany) return;
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_id", selectedCompany.id);
      formData.append("preference_system", preferenceSystem);
      const data = await analyzeMutation.mutateAsync(formData);
      setResult(data);
      setReturnableStatus(data.returnable_status ?? {});
      toast.success("Tender analyzed successfully!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to analyze tender");
    }
  }

  const toggleReturnable = async (name: string, current: boolean) => {
    if (!result?.tender_id) return;
    const nextVerified = !current;
    // optimistic
    setReturnableStatus((prev) => ({
      ...prev,
      [name]: {
        verified: nextVerified,
        verified_at: nextVerified ? new Date().toISOString() : null,
        doc_ref: prev[name]?.doc_ref ?? null,
      },
    }));
    try {
      const data = await apiSend<{ returnable_status: Record<string, ReturnableState> }>(
        "POST",
        `/api/tender/${result.tender_id}/returnables/toggle`,
        { returnable_name: name, verified: nextVerified },
      );
      setReturnableStatus(data.returnable_status);
    } catch (e) {
      // revert on failure
      setReturnableStatus((prev) => ({
        ...prev,
        [name]: {
          verified: current,
          verified_at: current ? new Date().toISOString() : null,
          doc_ref: prev[name]?.doc_ref ?? null,
        },
      }));
      toast.error(e instanceof Error ? e.message : "Failed to update returnable");
    }
  };

  const handleDownloadOriginal = async (tenderId: string) => {
    try {
      await downloadAuthenticatedFile(
        `/api/tenders/download/${tenderId}`,
        `tender-${tenderId}.pdf`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Original tender PDF not available");
    }
  };

  const uploadReturnable = async (name: string, file: File) => {
    if (!result?.tender_id) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("returnable_name", name);
    try {
      await apiForm(`/api/tender/${result.tender_id}/returnables/upload`, fd);
      setReturnableStatus((prev) => ({
        ...prev,
        [name]: {
          verified: true,
          verified_at: new Date().toISOString(),
          doc_ref: prev[name]?.doc_ref ?? null,
          file_name: file.name,
        },
      }));
      toast.success(`${file.name} attached to "${name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to attach file");
    }
  };

  const downloadSbd = async (tenderId: string, form: "sbd4" | "sbd61") => {
    try {
      await downloadAuthenticatedFile(
        `/api/tender/${tenderId}/${form}`,
        `${form.toUpperCase()}-${tenderId}.pdf`,
      );
      toast.success(`${form.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download form");
    }
  };

  const loading = analyzeMutation.isPending;

  if (companiesQueryResult.isPending || companiesQueryResult.isError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {companiesQueryResult.isError ? (
          <div className="text-center" data-testid="analyze-companies-error">
            <p className="text-sm text-red-600">Could not load your companies.</p>
            <Button
              data-testid="analyze-companies-retry"
              variant="outline"
              className="mt-4"
              onClick={() => void companiesQueryResult.refetch()}
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
      <div className="flex-1 flex items-center justify-center bg-zinc-50 p-8">
        <div className="text-center" data-testid="no-company-message">
          <p className="text-zinc-600 mb-4">No company profile found.</p>
          <Button data-testid="create-company-btn" onClick={() => void navigate({ to: "/setup" })}>
            Create Company Profile
          </Button>
        </div>
      </div>
    );
  }

  if (tendersQueryResult.isPending || tendersQueryResult.isError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {tendersQueryResult.isError ? (
          <div className="text-center" data-testid="analyze-tenders-error">
            <p className="text-sm text-red-600">Could not load your tender history.</p>
            <Button
              data-testid="analyze-tenders-retry"
              variant="outline"
              className="mt-4"
              onClick={() => void tendersQueryResult.refetch()}
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

  // Server sends the verdict on fresh analyses; older rows fall back to the
  // shared threshold function.
  const verdict = result ? (result.verdict ?? verdictFromScore(result.fit_score)) : null;

  return (
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
          data-testid="analyze-title"
        >
          Tender Analysis
        </h1>
        <p className="mt-2 text-sm text-zinc-600 sm:text-base">
          Upload a tender PDF for automated compliance audit and risk scoring
        </p>
      </div>

      <div className="p-4 sm:p-8">
        <Card className="rounded-sm border-zinc-200 shadow-none mb-8" data-testid="upload-card">
          <CardHeader className="border-b border-zinc-200">
            <CardTitle className="text-xl font-bold">Upload Tender Document</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {companies.length > 1 && (
                <Field data-testid="company-picker-wrapper">
                  <FieldLabel className="text-xs uppercase tracking-[0.1em] font-semibold">
                    Company Profile
                  </FieldLabel>
                  <Select
                    value={selectedCompanyId ?? ""}
                    onValueChange={(v: string | null) => setSelectedId((v as string) ?? "")}
                  >
                    <SelectTrigger
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
              {companies.length === 1 && selectedCompany && (
                <Field data-testid="profile-card">
                  <FieldLabel className="text-xs uppercase tracking-[0.1em] font-semibold">
                    Company Profile
                  </FieldLabel>
                  <button
                    type="button"
                    data-testid="profile-card-link"
                    onClick={() => void navigate({ to: "/setup" })}
                    className="mt-2 w-full p-4 bg-zinc-50 rounded-sm border border-zinc-200 text-left hover:border-zinc-900 hover:bg-white transition-colors"
                  >
                    <p className="font-semibold">{selectedCompany.company_name}</p>
                    <p className="text-sm text-zinc-600 mt-1">
                      B-BBEE Level{" "}
                      {selectedCompany.bbbee_level != null ? (
                        <span className="font-semibold text-zinc-900">
                          {selectedCompany.bbbee_level}
                        </span>
                      ) : (
                        <span className="font-semibold text-orange-700">Not set</span>
                      )}{" "}
                      • CIDB{" "}
                      {selectedCompany.cidb_crs_num ? (
                        <span className="font-semibold text-zinc-900">
                          {selectedCompany.cidb_crs_num}
                        </span>
                      ) : (
                        <span className="font-semibold text-orange-700">Not set</span>
                      )}
                    </p>
                  </button>
                </Field>
              )}

              <Field>
                <FieldLabel className="text-xs uppercase tracking-[0.1em] font-semibold">
                  PPPFA Preference System
                </FieldLabel>
                <RadioGroup
                  value={preferenceSystem}
                  onValueChange={(value) => setPreferenceSystem(value ?? "80/20")}
                  className="mt-2 grid gap-2"
                  data-testid="select-pppfa-system"
                  aria-label="Preference system"
                >
                  <FieldLabel
                    htmlFor="pppfa-80-20"
                    className="flex items-center gap-2 rounded-sm border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal"
                  >
                    <RadioGroupItem id="pppfa-80-20" value="80/20" />
                    80/20 System (Standard)
                  </FieldLabel>
                  <FieldLabel
                    htmlFor="pppfa-90-10"
                    className="flex items-center gap-2 rounded-sm border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal"
                  >
                    <RadioGroupItem id="pppfa-90-10" value="90/10" />
                    90/10 System (Above R50M)
                  </FieldLabel>
                </RadioGroup>
              </Field>

              <Field>
                <FieldLabel className="text-xs uppercase tracking-[0.1em] font-semibold">
                  Tender PDF Document
                </FieldLabel>
                <div className="mt-2">
                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-300 rounded-sm cursor-pointer hover:border-zinc-900 transition-colors"
                    data-testid="file-upload-area"
                  >
                    <div className="flex flex-col items-center">
                      <FileTextIcon className="mb-2 h-8 w-8 text-zinc-400" aria-hidden="true" />
                      {file ? (
                        <p
                          className="text-sm font-semibold text-zinc-900"
                          data-testid="selected-file-name"
                        >
                          {file.name}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-zinc-900">Click to upload PDF</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Only PDF tender packs supported
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      id="file-upload"
                      data-testid="file-input"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {file && (
                    <Attachment className="mt-3 rounded-sm" data-testid="selected-tender-file">
                      <AttachmentMedia>
                        <FileTextIcon aria-hidden="true" />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{file.name}</AttachmentTitle>
                        <AttachmentDescription>
                          PDF · {(file.size / 1024).toFixed(0)} KB
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          aria-label={`Remove ${file.name}`}
                          data-testid="remove-tender-file"
                          onClick={() => setFile(null)}
                        >
                          <XCircleIcon aria-hidden="true" />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  )}
                </div>
              </Field>

              <Button
                data-testid="analyze-btn"
                onClick={handleAnalyze}
                disabled={loading || !file}
                size="lg"
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
              >
                {loading ? "Analyzing Tender..." : "Run Compliance Audit"}
              </Button>

              {tenderList.length > 0 && (
                <div className="pt-4 border-t border-zinc-200" data-testid="tender-list-section">
                  <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-500 uppercase">
                    Recent Tenders
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {tenderList.slice(0, 5).map((t) => (
                      <li key={t.id} data-testid={`tender-list-item-${t.id}`}>
                        <Item variant="outline" className="rounded-sm">
                          <ItemContent>
                            <ItemTitle>{t.title ?? "Untitled"}</ItemTitle>
                            <ItemDescription>
                              {t.fit_score ?? ""}% • {t.required_cidb_grade ?? ""}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              data-testid={`sbd4-btn-${t.id}`}
                              onClick={() => void downloadSbd(t.id, "sbd4")}
                              aria-label={`Download SBD 4 for ${t.title ?? t.id}`}
                            >
                              SBD 4
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              data-testid={`sbd61-btn-${t.id}`}
                              onClick={() => void downloadSbd(t.id, "sbd61")}
                              aria-label={`Download SBD 6.1 for ${t.title ?? t.id}`}
                            >
                              SBD 6.1
                            </Button>
                          </ItemActions>
                        </Item>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-6" data-testid="results-section">
            <Card className="rounded-sm border-zinc-200 shadow-none" data-testid="fit-score-card">
              <CardHeader className="border-b border-zinc-200">
                <CardTitle className="text-xl font-bold">Go / No-Go Analysis</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-shrink-0">
                    <GoNoGoGauge score={result.fit_score} />
                    {verdict && (
                      <p
                        className="text-center text-sm font-semibold tracking-[0.12em] uppercase mt-2"
                        data-testid="verdict-label"
                      >
                        {verdict}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 space-y-4 md:border-l md:border-zinc-200 md:pl-6 w-full">
                    <div data-testid="bbbee-points-block">
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-1">
                        B-BBEE Preference Points
                      </p>
                      <div className="text-4xl font-bold" data-testid="bbbee-points-value">
                        {result.eligible_bbbee_points}
                      </div>
                      <p className="text-sm text-zinc-600 mt-1">
                        out of {preferenceSystem === "90/10" ? "10" : "20"} points
                      </p>
                    </div>
                    <div data-testid="risk-flags-summary">
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-1">
                        Risk Flags
                      </p>
                      <div className="text-4xl font-bold" data-testid="risk-flags-count">
                        {result.risk_flags.length}
                      </div>
                      <p className="text-sm text-zinc-600 mt-1">
                        {result.risk_flags.length === 0 ? "all clear" : "issues to review"}
                      </p>
                    </div>
                    <div data-testid="fit-score-summary">
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-1">
                        Fit Score
                      </p>
                      <div className="text-2xl font-bold" data-testid="fit-score-value">
                        {result.fit_score} / 100
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="rounded-sm border-zinc-200 shadow-none"
              data-testid="tender-details-card"
            >
              <CardHeader className="border-b border-zinc-200">
                <CardTitle className="text-xl font-bold">Tender Details</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.1em] text-zinc-500">Tender Title</p>
                    <p className="font-semibold mt-1" data-testid="tender-title-value">
                      {result.tender_title}
                    </p>
                    {result.tender_id && (
                      <button
                        type="button"
                        data-testid="download-original-pdf-btn"
                        onClick={() => void handleDownloadOriginal(result.tender_id!)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                      >
                        <FileDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Download original PDF
                      </button>
                    )}
                  </div>
                  {result.required_cidb && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-zinc-500">
                        Required CIDB Grade
                      </p>
                      <p className="font-semibold mt-1" data-testid="required-cidb-value">
                        {result.required_cidb}
                      </p>
                    </div>
                  )}
                  {result.closing_date && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-zinc-500">
                        Closing Date
                      </p>
                      <p className="font-semibold mt-1" data-testid="closing-date-value">
                        {new Date(result.closing_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {result.evaluation_criteria && result.evaluation_criteria.length > 0 && (
              <Card
                className="rounded-sm border-zinc-200 shadow-none"
                data-testid="evaluation-criteria-card"
              >
                <CardHeader className="border-b border-zinc-200">
                  <CardTitle className="text-xl font-bold">Evaluation Criteria</CardTitle>
                  <p className="text-sm text-zinc-600 mt-1">
                    Structured scoring as extracted by AI — verify against the tender document.
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <ul className="space-y-2" data-testid="evaluation-criteria-list">
                    {result.evaluation_criteria.map((c, idx) => (
                      <li
                        key={`${idx}-${c.slice(0, 20)}`}
                        data-testid={`evaluation-criteria-${idx}`}
                        className="flex items-start gap-2 text-sm text-zinc-800"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-900 shrink-0" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-sm border-zinc-200 shadow-none" data-testid="returnables-card">
              <CardHeader className="border-b border-zinc-200">
                <CardTitle className="text-xl font-bold">Submission Checklist</CardTitle>
                <p className="text-sm text-zinc-600 mt-1">
                  Track your progress as you gather each required document.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                {result.mandatory_returnables.length === 0 ? (
                  <p className="text-zinc-600">No specific returnables detected</p>
                ) : (
                  <ul className="space-y-3" data-testid="returnables-list">
                    {result.mandatory_returnables.map((name) => {
                      const status = returnableStatus[name] ?? {
                        verified: false,
                        verified_at: null,
                        doc_ref: null,
                      };
                      return (
                        <li
                          key={name}
                          className="flex items-center gap-3 p-3 rounded-sm border border-zinc-200 bg-white"
                          data-testid={`returnable-row-${name.replace(/[^a-zA-Z0-9]/g, "_")}`}
                        >
                          <Checkbox
                            checked={status.verified}
                            onCheckedChange={() => void toggleReturnable(name, status.verified)}
                            data-testid={`returnable-toggle-${name.replace(/[^a-zA-Z0-9]/g, "_")}`}
                            aria-label={`Mark ${name} as ${status.verified ? "missing" : "included"}`}
                          />
                          <span
                            className={`flex-1 text-sm ${status.verified ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
                          >
                            {name}
                          </span>
                          <label
                            className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
                            title="Attach a supporting file"
                          >
                            <PaperclipIcon className="h-3 w-3" aria-hidden="true" />
                            {status.file_name ? (
                              <span className="max-w-24 truncate">{status.file_name}</span>
                            ) : (
                              "Attach"
                            )}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadReturnable(name, f);
                                e.target.value = "";
                              }}
                              data-testid={`returnable-upload-${name.replace(/[^a-zA-Z0-9]/g, "_")}`}
                              aria-label={`Attach supporting file for ${name}`}
                            />
                          </label>
                          <span
                            className={`text-xs font-bold uppercase tracking-[0.08em] ${status.verified ? "text-green-700" : "text-zinc-400"}`}
                            data-testid={`returnable-status-${name.replace(/[^a-zA-Z0-9]/g, "_")}`}
                          >
                            {status.verified ? "Included" : "Missing"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-sm border-zinc-200 shadow-none" data-testid="risk-flags-card">
              <CardHeader className="border-b border-zinc-200">
                <CardTitle className="text-xl font-bold">Compliance Risk Alerts</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {result.risk_flags.length === 0 ? (
                  <div
                    className="flex items-center gap-2 text-green-600"
                    data-testid="risk-flags-empty"
                  >
                    <span className="font-semibold">
                      No disqualification risks detected. All compliance checks passed.
                    </span>
                  </div>
                ) : (
                  <ul className="space-y-3" data-testid="risk-flags-list">
                    {result.risk_flags.map((flag, idx) => (
                      <li
                        key={`${idx}-${flag.slice(0, 30)}`}
                        data-testid={`risk-flag-${idx}`}
                        className={`flex items-start gap-3 p-3 rounded-sm ${
                          flag.includes("CRITICAL")
                            ? "bg-red-50 border border-red-200"
                            : "bg-orange-50 border border-orange-200"
                        }`}
                      >
                        {flag.includes("CRITICAL") ? (
                          <XCircleIcon
                            className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertCircleIcon
                            className="mt-0.5 h-4 w-4 shrink-0 text-orange-600"
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={`text-sm font-medium ${flag.includes("CRITICAL") ? "text-red-900" : "text-orange-900"}`}
                        >
                          {flag}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="sbd-downloads">
              <Button
                data-testid="download-sbd4-btn"
                onClick={() => void downloadSbd(result.tender_id, "sbd4")}
                size="lg"
                className="h-16 justify-start bg-zinc-900 px-6 text-white hover:bg-zinc-800"
              >
                <FileDownIcon className="!h-5 !w-5" aria-hidden="true" />
                <span className="text-left">
                  <span className="block font-bold">Download SBD 4</span>
                  <span className="block text-xs opacity-80">Declaration of Interest</span>
                </span>
              </Button>
              <Button
                data-testid="download-sbd61-btn"
                onClick={() => void downloadSbd(result.tender_id, "sbd61")}
                size="lg"
                className="h-16 justify-start bg-zinc-900 px-6 text-white hover:bg-zinc-800"
              >
                <FileDownIcon className="!h-5 !w-5" aria-hidden="true" />
                <span className="text-left">
                  <span className="block font-bold">Download SBD 6.1</span>
                  <span className="block text-xs opacity-80">Preference Points Claim</span>
                </span>
              </Button>
            </div>

            <Button
              data-testid="view-dashboard-btn"
              onClick={() => void navigate({ to: "/app" })}
              variant="outline"
              size="lg"
              className="w-full border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white"
            >
              View All Tenders on Dashboard
            </Button>
          </div>
        )}

        {!result && (
          <div
            className="rounded-sm border border-dashed border-zinc-300 bg-white p-8 text-center"
            data-testid="empty-state"
          >
            <p className="text-zinc-600">
              Upload a tender PDF above to see your Go / No-Go analysis.
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Scoring uses your company&apos;s compliance vault, CIDB grades, and bargaining council
              coverage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
