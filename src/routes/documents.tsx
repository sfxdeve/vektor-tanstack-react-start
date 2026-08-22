import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  FileTextIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

import { apiForm, apiSend } from "@/lib/api-client";
import type { VaultDoc } from "@/lib/api-client";
import { companiesQuery, councilsQuery, documentsQuery } from "@/lib/queries";
import { downloadAuthenticatedFile } from "@/lib/download";
import {
  NEEDS_EXPIRY_TYPES,
  isBbbeeMismatch,
  isBcGos,
  isExpiryMismatch,
  type DocType,
  type VaultDocMutation,
} from "@/lib/compliance";
import { useRequireUser } from "@/hooks/use-require-user";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

const PREVIEW_TYPES = NEEDS_EXPIRY_TYPES;

function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isPending } = useRequireUser();
  const authenticated = Boolean(session?.user);

  const companiesQueryResult = useQuery({ ...companiesQuery(), enabled: authenticated });
  const councilsQueryResult = useQuery(councilsQuery());
  const councilCatalog = councilsQueryResult.data?.councils ?? [];
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    file_name: string;
    doc_type: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingDoc, setEditingDoc] = useState<VaultDoc | null>(null);
  const [editForm, setEditForm] = useState<VaultDocMutation>({
    expiry_date: "",
    is_compliant: true,
    bargaining_council: null,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [formData, setFormData] = useState<VaultDocMutation & { doc_type: string }>({
    doc_type: "",
    expiry_date: "",
    is_compliant: true,
    bargaining_council: null,
  });
  const [bbbeePreview, setBbbeePreview] = useState<{
    level: number | null;
    expiry: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const companies = companiesQueryResult.data ?? [];
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;
  const companyId = selectedCompany?.id;

  const documentsQueryResult = useQuery({
    ...documentsQuery(companyId!),
    enabled: Boolean(companyId),
  });
  const documents = documentsQueryResult.data ?? [];

  // Auto-select the first company once the list arrives.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0]!.id);
    }
  }, [companies, selectedCompanyId]);

  const invalidateDocuments = () =>
    queryClient.invalidateQueries({ queryKey: documentsQuery(companyId!).queryKey });

  const uploadMutation = useMutation({
    mutationFn: (form: FormData) => apiForm<VaultDoc>("/api/documents/upload", form),
    onSuccess: () => void invalidateDocuments(),
  });
  const deleteMutation = useMutation({
    mutationFn: (docId: string) => apiSend<void>("DELETE", `/api/documents/${docId}`),
    onSuccess: () => void invalidateDocuments(),
  });
  const editMutation = useMutation({
    mutationFn: ({ docId, payload }: { docId: string; payload: Record<string, unknown> }) =>
      apiSend<VaultDoc>("PATCH", `/api/documents/${docId}`, payload),
    onSuccess: () => void invalidateDocuments(),
  });

  const councilLabel = useCallback(
    (code: string) => councilCatalog.find((c) => c.code === code)?.name || code,
    [councilCatalog],
  );

  // Preview extraction when file or doc_type changes
  useEffect(() => {
    setBbbeePreview(null);
    if (!PREVIEW_TYPES.has(formData.doc_type as DocType) || !uploadFile) return;
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
    if (isBcGos(formData.doc_type) && !formData.bargaining_council) {
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
      if (isBcGos(formData.doc_type)) {
        multipart.append("bargaining_council", formData.bargaining_council!);
      }

      const replacingExisting = documents.some((d) => {
        if (d.doc_type !== formData.doc_type) return false;
        if (isBcGos(formData.doc_type)) {
          return d.bargaining_council === formData.bargaining_council;
        }
        return true;
      });

      const uploaded = await uploadMutation.mutateAsync(multipart);

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
        } else if (isBbbeeMismatch(profileLevel, uploaded.extracted_bbbee_level)) {
          toast.warning(
            `Mismatch: your profile says Level ${profileLevel} but the uploaded certificate says Level ${uploaded.extracted_bbbee_level}. Update whichever is wrong before your next tender analysis.`,
            { duration: 12000 },
          );
        }
      }

      if (isExpiryMismatch(formData.expiry_date, uploaded.extracted_expiry_date)) {
        toast.warning(
          `Expiry mismatch: you typed ${formData.expiry_date}, but the document itself reads ${uploaded.extracted_expiry_date}. Update whichever is wrong so reminder emails fire at the right time.`,
          { duration: 12000 },
        );
      }

      setFormData({ doc_type: "", expiry_date: "", is_compliant: true, bargaining_council: null });
      setUploadFile(null);
      const fileInput = document.getElementById("file_name") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to upload document";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      await downloadAuthenticatedFile(`/api/documents/download/${docId}`, fileName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download document");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success(`"${pendingDelete.file_name}" removed from vault`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete document");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (doc: VaultDoc) => {
    setEditingDoc(doc);
    setEditForm({
      expiry_date: doc.expiry_date ? doc.expiry_date.slice(0, 10) : "",
      is_compliant: doc.is_compliant,
      bargaining_council: doc.bargaining_council ?? null,
    });
  };

  const handleEditSave = async () => {
    if (!editingDoc) return;
    if (!editForm.expiry_date) {
      toast.error("Expiry date is required");
      return;
    }
    if (isBcGos(editingDoc.doc_type) && !editForm.bargaining_council) {
      toast.error("Bargaining council is required");
      return;
    }
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        expiry_date: editForm.expiry_date,
        is_compliant: editForm.is_compliant,
      };
      if (isBcGos(editingDoc.doc_type)) {
        payload.bargaining_council = editForm.bargaining_council;
      }
      await editMutation.mutateAsync({ docId: editingDoc.id, payload });
      toast.success("Document updated");
      setEditingDoc(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update document");
    } finally {
      setSavingEdit(false);
    }
  };

  if (isPending || !session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Spinner className="h-6 w-6 text-zinc-400" />
      </div>
    );
  }

  if (!companies.length && !companiesQueryResult.isPending) {
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
            <ArrowLeftIcon aria-hidden="true" />
            Back to Dashboard
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
                        Verify TCS PIN at SARS Portal
                        <ArrowUpRightIcon className="h-3 w-3" aria-hidden="true" />
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
                        B-BBEE Commission Portal
                        <ArrowUpRightIcon className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                    {isBcGos(formData.doc_type) && (
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
                          value={formData.bargaining_council ?? ""}
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
                    {PREVIEW_TYPES.has(formData.doc_type as DocType) && previewLoading && (
                      <p
                        className="mt-1.5 text-[11px] text-zinc-500"
                        data-testid="bbbee-preview-loading"
                      >
                        Reading certificate…
                      </p>
                    )}
                    {PREVIEW_TYPES.has(formData.doc_type as DocType) &&
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
                        {isBbbeeMismatch(selectedCompany?.bbbee_level, bbbeePreview.level) && (
                          <span className="text-orange-700">
                            {" "}
                            — doesn&apos;t match your profile (Level {selectedCompany?.bbbee_level})
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
              {documentsQueryResult.isPending ? (
                <div className="flex justify-center p-8">
                  <Spinner className="h-6 w-6 text-zinc-400" />
                </div>
              ) : documents.length === 0 ? (
                <div className="p-8" data-testid="empty-docs">
                  <Empty className="gap-3">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileTextIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No documents uploaded yet</EmptyTitle>
                      <EmptyDescription>Add your first compliance document above.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-zinc-200">
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
                            className="odd:bg-white even:bg-zinc-50/60 hover:bg-zinc-100 transition-colors"
                            data-testid={`doc-row-${doc.id}`}
                          >
                            <td className="px-6 py-4 text-sm font-medium">
                              {doc.doc_type.replace(/_/g, " ")}
                              {isBcGos(doc.doc_type) && doc.bargaining_council && (
                                <span
                                  data-testid={`doc-council-${doc.id}`}
                                  className="ml-2 inline-flex items-center rounded-sm bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-700"
                                  title={councilLabel(doc.bargaining_council)}
                                >
                                  {doc.bargaining_council.replace(/_/g, " ")}
                                </span>
                              )}
                              {doc.doc_type === "BBBEE" && doc.extracted_bbbee_level != null && (
                                <Badge
                                  variant={
                                    isBbbeeMismatch(
                                      selectedCompany?.bbbee_level,
                                      doc.extracted_bbbee_level,
                                    )
                                      ? "secondary"
                                      : "outline"
                                  }
                                  data-testid={`doc-bbbee-cert-level-${doc.id}`}
                                  className={`ml-2 rounded-sm uppercase ${
                                    isBbbeeMismatch(
                                      selectedCompany?.bbbee_level,
                                      doc.extracted_bbbee_level,
                                    )
                                      ? "bg-orange-100 text-orange-800"
                                      : ""
                                  }`}
                                >
                                  {isBbbeeMismatch(
                                    selectedCompany?.bbbee_level,
                                    doc.extracted_bbbee_level,
                                  )
                                    ? `Cert L${doc.extracted_bbbee_level} ≠ Profile L${selectedCompany?.bbbee_level}`
                                    : `Cert L${doc.extracted_bbbee_level}`}
                                </Badge>
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
                              {NEEDS_EXPIRY_TYPES.has(doc.doc_type as DocType) &&
                                isExpiryMismatch(doc.expiry_date, doc.extracted_expiry_date) && (
                                  <div
                                    data-testid={`doc-expiry-mismatch-${doc.id}`}
                                    className="mt-1 inline-flex items-center rounded-sm bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-orange-800"
                                    title={`Document reads ${doc.extracted_expiry_date}`}
                                  >
                                    Cert:{" "}
                                    {new Date(doc.extracted_expiry_date!).toLocaleDateString()}
                                  </div>
                                )}
                            </td>
                            <td className="px-6 py-4">
                              {doc.is_compliant && !isExpired ? (
                                <span
                                  className="inline-flex items-center gap-1 text-sm font-semibold text-green-600"
                                  data-testid={`doc-status-compliant-${doc.id}`}
                                >
                                  <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                                  Compliant
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-sm font-semibold text-red-600"
                                  data-testid={`doc-status-noncompliant-${doc.id}`}
                                >
                                  <XCircleIcon className="h-4 w-4" aria-hidden="true" />
                                  {isExpired ? "Expired" : "Non-Compliant"}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {doc.storage_key && (
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

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-testid="delete-doc-dialog" className="rounded-sm sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.doc_type.replaceAll("_", " ")}</strong> —{" "}
              {pendingDelete?.file_name}
              <span className="mt-2 block">
                This deletes the file from your vault and cannot be undone. Any pending expiry
                reminders for this document will also be cleared.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-doc-cancel" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="delete-doc-confirm"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editingDoc != null}
        onOpenChange={(open) => {
          if (!open) setEditingDoc(null);
        }}
      >
        {editingDoc && (
          <DialogContent data-testid="edit-doc-dialog" className="rounded-sm sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Document</DialogTitle>
              <DialogDescription>
                {editingDoc?.doc_type.replace(/_/g, " ")} — {editingDoc?.file_name}
              </DialogDescription>
            </DialogHeader>
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
                {isExpiryMismatch(editForm.expiry_date, editingDoc.extracted_expiry_date) && (
                  <p
                    className="mt-1.5 text-[11px] text-orange-700"
                    data-testid="edit-expiry-mismatch"
                  >
                    Note: certificate reads{" "}
                    {new Date(editingDoc.extracted_expiry_date!).toLocaleDateString()}
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
                    value={editForm.bargaining_council ?? ""}
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
            <div className="flex justify-end gap-3">
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
              >
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
