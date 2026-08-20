// oxlint-disable react/set-state-in-effect, react/purity
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/analyze")({
  component: AnalyzePage,
});

type Company = {
  id: string;
  company_name: string;
  cidb_crs_num?: string | null;
  bbbee_level?: number | null;
  preferred_pppfa_system?: string | null;
};

type TenderResult = {
  tender_id: string;
  tender_title: string;
  required_cidb: string | null;
  mandatory_returnables: string[];
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
};

function GoNoGoGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  let color = "#DC2626";
  let label = "NO-GO";
  let subtitle = "High disqualification risk";
  if (clamped >= 75) {
    color = "#16A34A";
    label = "GO";
    subtitle = "Recommended to bid";
  } else if (clamped >= 50) {
    color = "#D97706";
    label = "CAUTION";
    subtitle = "Address risks first";
  }
  const size = 180;
  const radius = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const startAngle = Math.PI;
  const endAngle = Math.PI + (clamped / 100) * Math.PI;
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const bgEndX = cx + radius * Math.cos(Math.PI * 2);
  const bgEndY = cy + radius * Math.sin(Math.PI * 2);
  const largeArc = clamped > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center" data-testid="gonogo-gauge">
      <svg width={size} height={size / 1.5 + 12} viewBox={`0 0 ${size} ${size / 1.5 + 15}`}>
        <path
          d={`M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke="#E4E4E7"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {clamped > 0 && (
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}
        {[50, 75].map((tick) => {
          const angle = Math.PI + (tick / 100) * Math.PI;
          const inner = radius - 10;
          const outer = radius + 10;
          return (
            <line
              key={tick}
              x1={cx + inner * Math.cos(angle)}
              y1={cy + inner * Math.sin(angle)}
              x2={cx + outer * Math.cos(angle)}
              y2={cy + outer * Math.sin(angle)}
              stroke="#71717A"
              strokeWidth="1.5"
            />
          );
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={size / 5}
          fontWeight={700}
          fontFamily="Cabinet Grotesk, sans-serif"
          fill="#09090B"
        >
          {clamped}%
        </text>
      </svg>
      <div className="text-center mt-1" style={{ color }} data-testid="gonogo-label-wrapper">
        <div className="text-xl font-bold tracking-tight" data-testid="gonogo-label">
          {label}
        </div>
        <div className="text-xs text-zinc-500">{subtitle}</div>
      </div>
    </div>
  );
}

function AnalyzePage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [preferenceSystem, setPreferenceSystem] = useState("80/20");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TenderResult | null>(null);
  const [returnableStatus, setReturnableStatus] = useState<
    Record<string, { verified: boolean; verified_at: string | null; doc_ref: string | null }>
  >({});
  const [tenderList, setTenderList] = useState<
    Array<{ id: string; title: string; fit_score: number; required_cidb_grade: string | null }>
  >([]);

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

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? (data as Company[]) : [];
        setCompanies(list);
        if (list.length > 0 && !selectedCompanyId) {
          const first = list[0]!;
          setSelectedCompanyId(first.id);
          if (first.preferred_pppfa_system) setPreferenceSystem(first.preferred_pppfa_system);
        }
      })
      .catch(() => setCompanies([]));
  }, [session, selectedCompanyId]);

  useEffect(() => {
    if (selectedCompany?.preferred_pppfa_system) {
      setPreferenceSystem(selectedCompany.preferred_pppfa_system);
    }
  }, [selectedCompany]);

  const fetchTenders = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/tenders/${companyId}`);
      if (!res.ok) return;
      const data = (await res.json()) as Array<{
        id: string;
        title: string;
        fit_score: number;
        required_cidb_grade: string | null;
      }>;
      setTenderList(Array.isArray(data) ? data : []);
    } catch {
      setTenderList([]);
    }
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      void fetchTenders(selectedCompany.id);
    }
  }, [selectedCompany, fetchTenders, result]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    if (selectedFile && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      e.target.value = "";
      return;
    }
    setFile(selectedFile);
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error("Please select a PDF file");
      return;
    }
    if (!selectedCompany) {
      toast.error("Please create a company profile first");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_id", selectedCompany.id);
      formData.append("preference_system", preferenceSystem);

      const res = await fetch("/api/tenders/analyze", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        if (res.status === 402) {
          toast.error(data.detail || "Insufficient credits");
        } else {
          toast.error(data.detail || "Failed to analyze tender");
        }
        return;
      }
      const data = (await res.json()) as TenderResult;
      setResult(data);
      setReturnableStatus(data.returnable_status ?? {});
      toast.success("Tender analyzed successfully!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to analyze tender";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

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
      const res = await fetch(`/api/tender/${result.tender_id}/returnables/toggle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnable_name: name, verified: nextVerified }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail || "Failed to toggle");
      }
      const data = (await res.json()) as { returnable_status: typeof returnableStatus };
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
        <main className="flex-1 flex items-center justify-center bg-zinc-50 p-8">
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

  const verdict =
    result?.verdict ??
    (result
      ? result.fit_score >= 75
        ? "GO"
        : result.fit_score >= 50
          ? "CAUTION"
          : "NO-GO"
      : null);

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
                  <div data-testid="company-picker-wrapper">
                    <Label className="text-xs uppercase tracking-[0.1em] font-semibold">
                      Company Profile
                    </Label>
                    <Select
                      value={selectedCompanyId ?? ""}
                      onValueChange={(v: string | null) =>
                        setSelectedCompanyId((v as string) ?? "")
                      }
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
                  </div>
                )}
                {companies.length === 1 && selectedCompany && (
                  <div data-testid="profile-card">
                    <Label className="text-xs uppercase tracking-[0.1em] font-semibold">
                      Company Profile
                    </Label>
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
                  </div>
                )}

                <div>
                  <Label className="text-xs uppercase tracking-[0.1em] font-semibold">
                    PPPFA Preference System
                  </Label>
                  <Select
                    onValueChange={(v: string | null) =>
                      setPreferenceSystem((v as string) ?? "80/20")
                    }
                    value={preferenceSystem}
                  >
                    <SelectTrigger
                      data-testid="select-pppfa-system"
                      aria-label="Preference system"
                      className="mt-2 rounded-sm bg-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80/20">80/20 System (Standard)</SelectItem>
                      <SelectItem value="90/10">90/10 System (Above R50M)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-[0.1em] font-semibold">
                    Tender PDF Document
                  </Label>
                  <div className="mt-2">
                    <label
                      htmlFor="file-upload"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-300 rounded-sm cursor-pointer hover:border-zinc-900 transition-colors"
                      data-testid="file-upload-area"
                    >
                      <div className="flex flex-col items-center">
                        <p className="text-2xl mb-2">📄</p>
                        {file ? (
                          <p
                            className="text-sm font-semibold text-zinc-900"
                            data-testid="selected-file-name"
                          >
                            {file.name}
                          </p>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-zinc-900">
                              Click to upload PDF
                            </p>
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
                  </div>
                </div>

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
                    <h3 className="text-xs font-semibold tracking-[0.15em] text-zinc-500 uppercase">
                      Recent Tenders
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {tenderList.slice(0, 5).map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between rounded-sm border border-zinc-200 bg-white px-4 py-3 text-sm"
                          data-testid={`tender-list-item-${t.id}`}
                        >
                          <span className="font-medium truncate">{t.title ?? "Untitled"}</span>
                          <span className="ml-3 shrink-0 text-xs text-zinc-500">
                            {t.fit_score ?? ""}% • {t.required_cidb_grade ?? ""}
                          </span>
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
                      <p className="text-xs uppercase tracking-[0.1em] text-zinc-500">
                        Tender Title
                      </p>
                      <p className="font-semibold mt-1" data-testid="tender-title-value">
                        {result.tender_title}
                      </p>
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

              <Card
                className="rounded-sm border-zinc-200 shadow-none"
                data-testid="returnables-card"
              >
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
                            <input
                              type="checkbox"
                              checked={status.verified}
                              onChange={() => void toggleReturnable(name, status.verified)}
                              data-testid={`returnable-toggle-${name.replace(/[^a-zA-Z0-9]/g, "_")}`}
                              className="h-4 w-4 rounded-sm border-zinc-300"
                            />
                            <span
                              className={`flex-1 text-sm ${status.verified ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
                            >
                              {name}
                            </span>
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

              <Card
                className="rounded-sm border-zinc-200 shadow-none"
                data-testid="risk-flags-card"
              >
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
                          <span
                            className={`mt-0.5 text-sm ${flag.includes("CRITICAL") ? "text-red-600" : "text-orange-600"}`}
                          >
                            {flag.includes("CRITICAL") ? "✕" : "⚠"}
                          </span>
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
                Scoring uses your company&apos;s compliance vault, CIDB grades, and bargaining
                council coverage.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
