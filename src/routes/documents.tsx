// oxlint-disable react/set-state-in-effect, react/purity
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

type Company = {
  id: string;
  company_name: string;
  cipc_num?: string;
  bbbee_level?: number | null;
};

type VaultDoc = {
  id: string;
  company_id: string;
  doc_type: string;
  file_name: string;
  expiry_date: string | null;
  is_compliant: boolean;
  storage_path?: string | null;
  storage_key?: string | null;
  bargaining_council: string | null;
  extracted_bbbee_level: number | null;
  extracted_expiry_date: string | null;
  created_at: string;
};

const PREVIEW_TYPES = new Set(["BBBEE", "COIDA", "TAX_PIN", "BARGAINING_COUNCIL_GOS"]);

function DocumentsPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingDocs, setFetchingDocs] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    file_name: string;
    doc_type?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingDoc, setEditingDoc] = useState<VaultDoc | null>(null);
  const [editForm, setEditForm] = useState({
    expiry_date: "",
    is_compliant: true,
    bargaining_council: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [formData, setFormData] = useState({
    doc_type: "",
    expiry_date: "",
    is_compliant: true,
    bargaining_council: "",
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
  const [bbbeePreview, setBbbeePreview] = useState<{
    level: number | null;
    expiry: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    fetch("/api/reference/bargaining-councils")
      .then((r) => r.json())
      .then((d) => setCouncilCatalog((d as { councils: typeof councilCatalog }).councils || []))
      .catch(() => setCouncilCatalog([]));
  }, []);

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

  const councilLabel = useCallback(
    (code: string) => councilCatalog.find((c) => c.code === code)?.name || code,
    [councilCatalog],
  );

  const fetchDocuments = useCallback(async (companyId: string) => {
    setFetchingDocs(true);
    try {
      const res = await fetch(`/api/documents/${companyId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || "Failed to fetch documents");
      }
      const data = (await res.json()) as VaultDoc[];
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    } finally {
      setFetchingDocs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      void fetchDocuments(selectedCompany.id);
    } else {
      setDocuments([]);
    }
  }, [selectedCompany, fetchDocuments]);

  // Preview extraction when file or doc_type changes
  useEffect(() => {
    setBbbeePreview(null);
    if (!PREVIEW_TYPES.has(formData.doc_type) || !uploadFile) return;
    let cancelled = false;
    setPreviewLoading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("doc_type", formData.doc_type);
    fetch("/api/documents/preview-bbbee", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const d = data as {
          extracted_bbbee_level: number | null;
          extracted_expiry_date: string | null;
        };
        const level = d.extracted_bbbee_level ?? null;
        const expiry = d.extracted_expiry_date ?? null;
        setBbbeePreview(level || expiry ? { level, expiry } : null);
      })
      .catch(() => {
        if (!cancelled) setBbbeePreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uploadFile, formData.doc_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      toast.error("Please create a company profile first");
      return;
    }
    if (!formData.doc_type || !uploadFile || !formData.expiry_date) {
      toast.error("Document type, file, and expiry date are required");
      return;
    }
    if (formData.doc_type === "BARGAINING_COUNCIL_GOS" && !formData.bargaining_council) {
      toast.error("Please pick which Bargaining Council this letter is for");
      return;
    }

    setLoading(true);
    try {
      const multipart = new FormData();
      multipart.append("file", uploadFile);
      multipart.append("company_id", selectedCompany.id);
      multipart.append("doc_type", formData.doc_type);
      multipart.append("expiry_date", formData.expiry_date);
      multipart.append("is_compliant", String(formData.is_compliant));
      if (formData.doc_type === "BARGAINING_COUNCIL_GOS") {
        multipart.append("bargaining_council", formData.bargaining_council);
      }

      const replacingExisting = documents.some((d) => {
        if (d.doc_type !== formData.doc_type) return false;
        if (formData.doc_type === "BARGAINING_COUNCIL_GOS") {
          return d.bargaining_council === formData.bargaining_council;
        }
        return true;
      });

      const res = await fetch("/api/documents/upload", { method: "POST", body: multipart });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || "Failed to upload document");
      }
      const uploaded = (await res.json()) as VaultDoc;

      toast.success(
        replacingExisting
          ? "Document updated — previous copy removed from vault"
          : "Document uploaded successfully!",
      );

      if (uploaded.doc_type === "BBBEE" && uploaded.extracted_bbbee_level != null) {
        const profileLevel = selectedCompany?.bbbee_level;
        if (profileLevel == null) {
          toast.info(
            `Certificate says B-BBEE Level ${uploaded.extracted_bbbee_level}. Add it to your Company Setup to earn preference points on tender analysis.`,
            { duration: 9000 },
          );
        } else if (Number(profileLevel) !== Number(uploaded.extracted_bbbee_level)) {
          toast.warning(
            `Mismatch: your profile says Level ${profileLevel} but the uploaded certificate says Level ${uploaded.extracted_bbbee_level}. Update whichever is wrong before your next tender analysis.`,
            { duration: 12000 },
          );
        }
      }

      if (
        uploaded.extracted_expiry_date &&
        formData.expiry_date &&
        uploaded.extracted_expiry_date !== formData.expiry_date
      ) {
        toast.warning(
          `Expiry mismatch: you typed ${formData.expiry_date}, but the document itself reads ${uploaded.extracted_expiry_date}. Update whichever is wrong so reminder emails fire at the right time.`,
          { duration: 12000 },
        );
      }

      setFormData({ doc_type: "", expiry_date: "", is_compliant: true, bargaining_council: "" });
      setUploadFile(null);
      // reset file input value via DOM
      const fileInput = document.getElementById("file_name") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      await fetchDocuments(selectedCompany.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to upload document";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/documents/download/${docId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || "Failed to download");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to download document";
      toast.error(msg);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || "Failed to delete document");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== pendingDelete.id));
      toast.success(`"${pendingDelete.file_name}" removed from vault`);
      setPendingDelete(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete document";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (doc: VaultDoc) => {
    setEditingDoc(doc);
    setEditForm({
      expiry_date: doc.expiry_date ? doc.expiry_date.slice(0, 10) : "",
      is_compliant: doc.is_compliant,
      bargaining_council: doc.bargaining_council ?? "",
    });
  };

  const handleEditSave = async () => {
    if (!editingDoc) return;
    if (!editForm.expiry_date) {
      toast.error("Expiry date is required");
      return;
    }
    if (editingDoc.doc_type === "BARGAINING_COUNCIL_GOS" && !editForm.bargaining_council) {
      toast.error("Bargaining council is required");
      return;
    }
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        expiry_date: editForm.expiry_date,
        is_compliant: editForm.is_compliant,
      };
      if (editingDoc.doc_type === "BARGAINING_COUNCIL_GOS") {
        payload.bargaining_council = editForm.bargaining_council;
      }
      const res = await fetch(`/api/documents/${editingDoc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || "Failed to update document");
      }
      const updated = (await res.json()) as VaultDoc;
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success("Document updated");
      setEditingDoc(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update document";
      toast.error(msg);
    } finally {
      setSavingEdit(false);
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

  if (!companies.length && !fetchingDocs) {
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
            data-testid="vault-title"
          >
            Compliance Document Vault
          </h1>
          <p className="mt-2 text-sm text-zinc-600 sm:text-base">
            Manage and track your statutory documents with expiry alerts
          </p>
          {companies.length > 1 && (
            <div className="mt-4 max-w-sm">
              <Label className="text-xs font-semibold tracking-[0.1em] uppercase">Company</Label>
              <Select
                value={selectedCompanyId ?? ""}
                onValueChange={(v) => setSelectedCompanyId(v as string)}
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
        </div>

        <div className="p-4 sm:p-8">
          <Card
            className="rounded-sm border-zinc-200 shadow-none mb-8"
            data-testid="add-document-card"
          >
            <CardHeader className="border-b border-zinc-200">
              <CardTitle className="text-xl font-bold">Add New Document</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="doc_type"
                      className="text-xs uppercase tracking-[0.1em] font-semibold"
                    >
                      Document Type *
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, doc_type: value as string }))
                      }
                      value={formData.doc_type}
                    >
                      <SelectTrigger
                        id="doc_type"
                        data-testid="select-doc-type"
                        aria-label="Document Type"
                        className="mt-2 rounded-sm bg-white"
                      >
                        <SelectValue placeholder="Select Document Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TAX_PIN">Tax Clearance Pin</SelectItem>
                        <SelectItem value="COIDA">COIDA Letter of Good Standing</SelectItem>
                        <SelectItem value="BBBEE">B-BBEE Certificate</SelectItem>
                        <SelectItem value="BARGAINING_COUNCIL_GOS">
                          Bargaining Council Letter of Good Standing
                        </SelectItem>
                        <SelectItem value="DIRECTOR_ID">Director ID Copy</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.doc_type === "TAX_PIN" && (
                      <a
                        data-testid="link-sars-tcs-portal"
                        href="https://tools.sars.gov.za/tcc/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                      >
                        Verify TCS PIN at SARS Portal ↗
                      </a>
                    )}
                    {formData.doc_type === "BBBEE" && (
                      <a
                        data-testid="link-bbbee-portal"
                        href="https://www.bbbeecommission.co.za/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                      >
                        B-BBEE Commission Portal ↗
                      </a>
                    )}
                    {formData.doc_type === "BARGAINING_COUNCIL_GOS" && (
                      <div className="mt-3" data-testid="bc-picker-wrapper">
                        <Label
                          htmlFor="bc_code"
                          className="text-xs uppercase tracking-[0.1em] font-semibold"
                        >
                          Which Council is this Letter for? *
                        </Label>
                        <Select
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              bargaining_council: value as string,
                            }))
                          }
                          value={formData.bargaining_council}
                        >
                          <SelectTrigger
                            id="bc_code"
                            data-testid="select-bargaining-council"
                            aria-label="Bargaining Council"
                            className="mt-2 rounded-sm bg-white"
                          >
                            <SelectValue placeholder="Select Bargaining Council" />
                          </SelectTrigger>
                          <SelectContent>
                            {councilCatalog.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {`${c.code.replace(/_/g, " ")} — ${c.name}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                          You can upload one Letter per council — a fresh upload only replaces the
                          letter for the same council.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label
                      htmlFor="file_name"
                      className="text-xs uppercase tracking-[0.1em] font-semibold"
                    >
                      Upload File *
                    </Label>
                    <Input
                      id="file_name"
                      data-testid="input-file-upload"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      className="mt-2 rounded-sm bg-white"
                    />
                    {uploadFile && (
                      <p className="text-xs text-zinc-600 mt-1">Selected: {uploadFile.name}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="expiry_date"
                      className="text-xs uppercase tracking-[0.1em] font-semibold"
                    >
                      Expiry Date *
                    </Label>
                    <Input
                      id="expiry_date"
                      data-testid="input-expiry-date"
                      type="date"
                      value={formData.expiry_date}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, expiry_date: e.target.value }))
                      }
                      className="mt-2 rounded-sm bg-white"
                    />
                    {PREVIEW_TYPES.has(formData.doc_type) && previewLoading && (
                      <p
                        className="mt-1.5 text-[11px] text-zinc-500"
                        data-testid="bbbee-preview-loading"
                      >
                        Reading certificate…
                      </p>
                    )}
                    {PREVIEW_TYPES.has(formData.doc_type) &&
                      bbbeePreview?.expiry &&
                      !previewLoading && (
                        <div
                          data-testid="bbbee-preview-hint"
                          className="mt-2 flex flex-wrap items-center gap-2 rounded-sm border border-teal-200 bg-teal-50 px-3 py-2"
                        >
                          <span className="text-[11px] font-semibold text-teal-900">
                            Detected expiry on document:
                          </span>
                          <span
                            className="text-xs font-mono text-teal-900"
                            data-testid="bbbee-preview-expiry"
                          >
                            {new Date(bbbeePreview.expiry).toLocaleDateString()}
                          </span>
                          {formData.expiry_date !== bbbeePreview.expiry && (
                            <button
                              type="button"
                              data-testid="bbbee-preview-autofill"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  expiry_date: bbbeePreview.expiry!,
                                }))
                              }
                              className="ml-auto inline-flex items-center rounded-sm bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 transition-colors"
                            >
                              Use this date
                            </button>
                          )}
                          {formData.expiry_date === bbbeePreview.expiry && (
                            <span
                              className="ml-auto text-[11px] font-semibold text-teal-800"
                              data-testid="bbbee-preview-applied"
                            >
                              ✓ Matched
                            </span>
                          )}
                        </div>
                      )}
                    {formData.doc_type === "BBBEE" && bbbeePreview?.level && !previewLoading && (
                      <p
                        className="mt-1.5 text-[11px] text-zinc-500"
                        data-testid="bbbee-preview-level"
                      >
                        Also detected on cert: <strong>B-BBEE Level {bbbeePreview.level}</strong>
                        {selectedCompany?.bbbee_level != null &&
                          Number(selectedCompany.bbbee_level) !== Number(bbbeePreview.level) && (
                            <span className="text-orange-700">
                              {" "}
                              — doesn&apos;t match your profile (Level {selectedCompany.bbbee_level}
                              )
                            </span>
                          )}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label
                      htmlFor="is_compliant"
                      className="text-xs uppercase tracking-[0.1em] font-semibold"
                    >
                      Compliance Status
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_compliant: (value as string) === "true",
                        }))
                      }
                      value={formData.is_compliant.toString()}
                    >
                      <SelectTrigger
                        id="is_compliant"
                        data-testid="select-compliance-status"
                        aria-label="Compliance Status"
                        className="mt-2 rounded-sm bg-white"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Compliant</SelectItem>
                        <SelectItem value="false">Non-Compliant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  data-testid="add-document-btn"
                  type="submit"
                  disabled={loading}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white"
                >
                  {loading ? "Adding..." : "Add Document"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card
            className="rounded-sm border-zinc-200 shadow-none"
            data-testid="documents-list-card"
          >
            <CardHeader className="border-b border-zinc-200">
              <CardTitle className="text-xl font-bold">Document Registry</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {fetchingDocs ? (
                <div className="p-8 text-center text-sm text-zinc-500">Loading documents…</div>
              ) : documents.length === 0 ? (
                <div className="p-8 text-center" data-testid="empty-docs">
                  <p className="text-4xl mb-3">📄</p>
                  <p className="text-zinc-600">
                    No documents uploaded yet. Add your first compliance document above.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                          File Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                          Expiry Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {documents.map((doc) => {
                        // oxlint-disable-next-line react/purity -- derived display value, recalculates on render is intentional
                        const daysUntilExpiry = doc.expiry_date
                          ? Math.ceil(
                              (new Date(doc.expiry_date).getTime() - Date.now()) /
                                (1000 * 60 * 60 * 24),
                            )
                          : null;
                        const isExpiringSoon =
                          daysUntilExpiry != null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                        const isExpired = daysUntilExpiry != null && daysUntilExpiry < 0;

                        return (
                          <tr
                            key={doc.id}
                            className="hover:bg-zinc-50 transition-colors"
                            data-testid={`doc-row-${doc.id}`}
                          >
                            <td className="px-6 py-4 text-sm font-medium">
                              {doc.doc_type.replace(/_/g, " ")}
                              {doc.doc_type === "BARGAINING_COUNCIL_GOS" &&
                                doc.bargaining_council && (
                                  <span
                                    data-testid={`doc-council-${doc.id}`}
                                    className="ml-2 inline-flex items-center rounded-sm bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-700"
                                    title={councilLabel(doc.bargaining_council)}
                                  >
                                    {doc.bargaining_council.replace(/_/g, " ")}
                                  </span>
                                )}
                              {doc.doc_type === "BBBEE" && doc.extracted_bbbee_level != null && (
                                <span
                                  data-testid={`doc-bbbee-cert-level-${doc.id}`}
                                  className={`ml-2 inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                                    selectedCompany?.bbbee_level != null &&
                                    Number(selectedCompany.bbbee_level) !==
                                      Number(doc.extracted_bbbee_level)
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-zinc-100 text-zinc-700"
                                  }`}
                                >
                                  {selectedCompany?.bbbee_level != null &&
                                  Number(selectedCompany.bbbee_level) !==
                                    Number(doc.extracted_bbbee_level)
                                    ? `Cert L${doc.extracted_bbbee_level} ≠ Profile L${selectedCompany.bbbee_level}`
                                    : `Cert L${doc.extracted_bbbee_level}`}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm" data-testid={`doc-file-${doc.id}`}>
                              {doc.file_name}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    isExpired
                                      ? "text-red-600 font-semibold"
                                      : isExpiringSoon
                                        ? "text-orange-600 font-semibold"
                                        : ""
                                  }
                                >
                                  {doc.expiry_date
                                    ? new Date(doc.expiry_date).toLocaleDateString()
                                    : "—"}
                                </span>
                              </div>
                              {["BBBEE", "COIDA", "TAX_PIN", "BARGAINING_COUNCIL_GOS"].includes(
                                doc.doc_type,
                              ) &&
                                doc.extracted_expiry_date &&
                                doc.extracted_expiry_date !== doc.expiry_date && (
                                  <div
                                    data-testid={`doc-expiry-mismatch-${doc.id}`}
                                    className="mt-1 inline-flex items-center rounded-sm bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-orange-800"
                                    title={`Document reads ${doc.extracted_expiry_date}`}
                                  >
                                    Cert: {new Date(doc.extracted_expiry_date).toLocaleDateString()}
                                  </div>
                                )}
                            </td>
                            <td className="px-6 py-4">
                              {doc.is_compliant && !isExpired ? (
                                <span
                                  className="inline-flex items-center gap-1 text-green-600 text-sm font-semibold"
                                  data-testid={`doc-status-compliant-${doc.id}`}
                                >
                                  ● Compliant
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-red-600 text-sm font-semibold"
                                  data-testid={`doc-status-noncompliant-${doc.id}`}
                                >
                                  ✕ {isExpired ? "Expired" : "Non-Compliant"}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {doc.storage_path && (
                                  <button
                                    data-testid={`download-doc-${doc.id}`}
                                    onClick={() => void handleDownload(doc.id, doc.file_name)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:underline"
                                  >
                                    Download
                                  </button>
                                )}
                                <button
                                  data-testid={`edit-doc-${doc.id}`}
                                  onClick={() => openEdit(doc)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  data-testid={`delete-doc-${doc.id}`}
                                  onClick={() =>
                                    setPendingDelete({
                                      id: doc.id,
                                      file_name: doc.file_name,
                                      doc_type: doc.doc_type,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                                  aria-label={`Delete ${doc.file_name}`}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="delete-doc-dialog"
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-bold">Remove this document?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              <strong>{pendingDelete.doc_type?.replace("_", " ")}</strong> —{" "}
              {pendingDelete.file_name}
              <span className="block mt-2">
                This deletes the file from your vault and cannot be undone. Any pending expiry
                reminders for this document will also be cleared.
              </span>
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                data-testid="delete-doc-cancel"
                variant="outline"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                data-testid="delete-doc-confirm"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? "Deleting..." : "Delete document"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="edit-doc-dialog"
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-bold">Edit Document</h3>
            <p className="text-xs text-zinc-500 mt-1">
              {editingDoc.doc_type.replace(/_/g, " ")} — {editingDoc.file_name}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <Label className="text-xs font-semibold tracking-[0.1em] uppercase">
                  Expiry Date
                </Label>
                <Input
                  data-testid="edit-expiry-date"
                  type="date"
                  value={editForm.expiry_date}
                  onChange={(e) => setEditForm((p) => ({ ...p, expiry_date: e.target.value }))}
                  className="mt-2 rounded-sm"
                />
                {editingDoc.extracted_expiry_date &&
                  editingDoc.extracted_expiry_date !== editForm.expiry_date && (
                    <p
                      className="mt-1.5 text-[11px] text-orange-700"
                      data-testid="edit-expiry-mismatch"
                    >
                      Note: certificate reads{" "}
                      {new Date(editingDoc.extracted_expiry_date).toLocaleDateString()}
                    </p>
                  )}
              </div>
              <div>
                <Label className="text-xs font-semibold tracking-[0.1em] uppercase">
                  Compliance Status
                </Label>
                <Select
                  value={editForm.is_compliant ? "true" : "false"}
                  onValueChange={(v) =>
                    setEditForm((p) => ({ ...p, is_compliant: (v as string) === "true" }))
                  }
                >
                  <SelectTrigger
                    data-testid="edit-compliance-status"
                    aria-label="Edit Compliance Status"
                    className="mt-2 rounded-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Compliant</SelectItem>
                    <SelectItem value="false">Non-Compliant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingDoc.doc_type === "BARGAINING_COUNCIL_GOS" && (
                <div data-testid="edit-bc-wrapper">
                  <Label className="text-xs font-semibold tracking-[0.1em] uppercase">
                    Bargaining Council
                  </Label>
                  <Select
                    value={editForm.bargaining_council}
                    onValueChange={(v) =>
                      setEditForm((p) => ({ ...p, bargaining_council: v as string }))
                    }
                  >
                    <SelectTrigger
                      data-testid="edit-bargaining-council"
                      aria-label="Edit Bargaining Council"
                      className="mt-2 rounded-sm"
                    >
                      <SelectValue placeholder="Select council" />
                    </SelectTrigger>
                    <SelectContent>
                      {councilCatalog.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {`${c.code.replace(/_/g, " ")} — ${c.name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                data-testid="edit-doc-cancel"
                variant="outline"
                disabled={savingEdit}
                onClick={() => setEditingDoc(null)}
              >
                Cancel
              </Button>
              <Button
                data-testid="edit-doc-save"
                disabled={savingEdit}
                onClick={() => void handleEditSave()}
                className="bg-zinc-900 text-white hover:bg-zinc-800"
              >
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
