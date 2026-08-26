import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BanknoteIcon, Building2Icon, FileDownIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ComplianceBanner } from "@/components/compliance-banner";
import { RecentActivityPanel } from "@/components/recent-activity-panel";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoCompanyEmpty } from "@/components/no-company-empty";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadAuthenticatedFile } from "@/lib/download";
import { formatDate } from "@/lib/date";
import { creditsQuery, companiesQuery, documentsQuery, tendersQuery } from "@/lib/queries";
import { verdictFromScore } from "@/lib/tender-scoring";

export const Route = createFileRoute("/_authed/app")({
  component: AppPage,
});

const MAX_POINTS_BY_SYSTEM: Record<string, number> = { "80/20": 20, "90/10": 10 };

function SbdDownloadButton({ tenderId, form }: { tenderId: string; form: "sbd4" | "sbd61" }) {
  const label = form === "sbd4" ? "SBD 4" : "SBD 6.1";
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      await downloadAuthenticatedFile(
        `/api/tender/${tenderId}/${form}`,
        `${form.toUpperCase()}-${tenderId}.pdf`,
      );
      toast.success(`${label} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to download ${label}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      data-testid={form === "sbd4" ? `sbd4-btn-${tenderId}` : `sbd61-btn-${tenderId}`}
      onClick={() => void handle()}
      disabled={busy}
      className="h-auto px-0 text-xs font-semibold text-zinc-900 underline-offset-2 hover:underline"
    >
      {busy ? <Spinner className="h-3 w-3" /> : <FileDownIcon aria-hidden="true" />}
      {label}
    </Button>
  );
}

function StatCard({
  testId,
  label,
  value,
  valueTestId,
  hint,
}: {
  testId: string;
  label: string;
  value: string;
  valueTestId?: string;
  hint?: ReactNode;
}) {
  return (
    <Card className="grid-border-item rounded-sm border-zinc-200 shadow-none" data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-zinc-900" data-testid={valueTestId}>
          {value}
        </div>
        {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function AppPage() {
  const navigate = useNavigate();

  const companiesQueryResult = useQuery(companiesQuery());
  const companies = companiesQueryResult.data ?? [];
  const selectedCompany = companies[0];

  const companyId = selectedCompany?.id;
  const tendersQueryResult = useQuery({ ...tendersQuery(companyId!), enabled: Boolean(companyId) });
  const documentsQueryResult = useQuery({
    ...documentsQuery(companyId!),
    enabled: Boolean(companyId),
  });
  const creditsQueryResult = useQuery({
    ...creditsQuery(companyId!),
    enabled: Boolean(companyId),
  });

  const tenders = tendersQueryResult.data ?? [];
  const documents = documentsQueryResult.data ?? [];

  if (companiesQueryResult.isPending || companiesQueryResult.isError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50">
        {companiesQueryResult.isError ? (
          <div className="text-center">
            <p className="text-sm text-red-600">Could not load your companies.</p>
            <Button
              data-testid="dashboard-companies-retry"
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

  if (companies.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-auto bg-background">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <p className="overline mb-1 text-zinc-500">Dashboard</p>
          <h1
            className="truncate text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
            data-testid="dashboard-title"
          >
            Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
            Your compliance overview.
          </p>
        </header>
        <NoCompanyEmpty testId="no-company-state" />
      </div>
    );
  }

  const dashboardQueries = [tendersQueryResult, documentsQueryResult, creditsQueryResult];
  if (dashboardQueries.some((query) => query.isPending || query.isError)) {
    const failed = dashboardQueries.some((query) => query.isError);
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8">
        {failed ? (
          <div className="text-center" data-testid="dashboard-load-error">
            <p className="text-sm text-red-600">Could not load your dashboard data.</p>
            <Button
              variant="outline"
              className="mt-4"
              data-testid="dashboard-retry"
              onClick={() => void Promise.all(dashboardQueries.map((query) => query.refetch()))}
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

  const company = selectedCompany!;
  const compliantDocs = documents.filter((d) => d.is_compliant).length;
  const totalDocs = documents.length;
  const avgFitScore =
    tenders.length > 0
      ? Math.round(tenders.reduce((sum, t) => sum + t.fit_score, 0) / tenders.length)
      : null;
  const credits = creditsQueryResult.data?.credits;

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background">
      {/* Solid header — never transparent over scrolled content */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Breadcrumb className="mb-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="overline text-zinc-500">Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1
              className="truncate text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
              data-testid="dashboard-title"
            >
              {company.company_name}
            </h1>
          </div>
          <Button
            data-testid="analyze-tender-btn"
            onClick={() => void navigate({ to: "/analyze" })}
            size="lg"
            className="w-full shrink-0 sm:w-auto"
          >
            <UploadIcon aria-hidden="true" />
            Analyze New Tender
          </Button>
        </div>
      </header>

      <div className="p-4 sm:p-8">
        {credits != null && !creditsQueryResult.isPending && (
          <div
            data-testid="dashboard-credit-hint"
            className="mb-6 flex flex-wrap items-center gap-2 rounded-sm border border-zinc-200 bg-white px-4 py-3 text-sm"
          >
            <span className="overline text-zinc-500">Credits</span>
            <span
              className="text-base font-bold text-zinc-900"
              data-testid="dashboard-credits-value"
            >
              {credits}
            </span>
            <span className="text-xs text-zinc-500">available</span>
            <Link
              to="/billing"
              data-testid="dashboard-billing-link"
              className="ml-auto text-xs font-semibold text-zinc-900 underline underline-offset-2"
            >
              Manage billing →
            </Link>
          </div>
        )}

        <ComplianceBanner documents={documents} />

        {/* Stats Grid — Swiss high-density technical cards with grid borders */}
        <div
          className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4"
          data-testid="dashboard-stats-grid"
        >
          <StatCard
            testId="stat-bbbee"
            label="B-BBEE Level"
            value={company.bbbee_level ? `Level ${company.bbbee_level}` : "N/A"}
            valueTestId="stat-bbbee-value"
            hint="Preference points"
          />
          <StatCard
            testId="stat-cidb"
            label="CIDB Grade"
            value={company.cidb_crs_num || "Not Set"}
            valueTestId={company.cidb_crs_num ? "cidb-display" : undefined}
            hint="Registered grades & classes"
          />
          <StatCard
            testId="stat-compliance"
            label="Compliance Status"
            value={totalDocs === 0 ? "No docs" : `${compliantDocs}/${totalDocs}`}
            hint={
              totalDocs === 0 ? (
                <>
                  Upload documents to get compliant
                  <span className="sr-only" aria-hidden="true">
                    Documents compliant
                  </span>
                </>
              ) : (
                "Documents compliant"
              )
            }
          />
          <StatCard
            testId="stat-avg-score"
            label="Avg Fit Score"
            value={avgFitScore == null ? "—" : `${avgFitScore}%`}
            hint={`Across ${tenders.length} tender${tenders.length === 1 ? "" : "s"}`}
          />
        </div>

        <RecentActivityPanel limit={8} />

        {/* Recent Tenders */}
        <Card
          className="mb-8 rounded-sm border-zinc-200 shadow-none"
          data-testid="recent-tenders-card"
        >
          <CardHeader className="border-b border-zinc-200">
            <CardTitle className="text-xl font-bold tracking-tight">
              Recent Tender Analyses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tenders.length === 0 ? (
              <div className="p-8" data-testid="empty-tenders">
                <Empty className="gap-3 border-solid">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileTextIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No tenders analyzed yet</EmptyTitle>
                    <EmptyDescription>Upload a tender PDF to get started.</EmptyDescription>
                  </EmptyHeader>
                  <Button
                    data-testid="empty-cta-analyze"
                    onClick={() => void navigate({ to: "/analyze" })}
                    variant="outline"
                  >
                    Analyze a tender
                  </Button>
                </Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader className="bg-zinc-50">
                    <TableRow className="hover:bg-transparent">
                      {[
                        "Tender Title",
                        "Fit Score",
                        "B-BBEE Points",
                        "Risk Flags",
                        "Date",
                        "SBD Forms",
                      ].map((heading) => (
                        <TableHead
                          key={heading}
                          className="border-b border-zinc-200 px-6 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700"
                        >
                          {heading}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-zinc-200">
                    {tenders.slice(0, 5).map((tender) => {
                      const verdict = verdictFromScore(tender.fit_score);
                      return (
                        <TableRow
                          key={tender.id}
                          className="hover:bg-zinc-50"
                          data-testid={`tender-row-${tender.id}`}
                        >
                          <TableCell className="max-w-[12rem] px-6 py-4 font-medium text-zinc-900 sm:max-w-[18rem]">
                            <span
                              className="block max-w-[12rem] truncate sm:max-w-[18rem]"
                              title={tender.title}
                            >
                              {tender.title}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <Badge
                              className={`rounded-sm ${
                                verdict === "GO"
                                  ? "bg-green-100 text-green-800"
                                  : verdict === "CAUTION"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
                              }`}
                              data-testid={`tender-fit-badge-${tender.id}`}
                            >
                              {verdict}
                              <span className="opacity-70">· {tender.fit_score}%</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-zinc-700 whitespace-normal">
                            {tender.eligible_bbbee_points} /{" "}
                            {MAX_POINTS_BY_SYSTEM[tender.preference_point_system] ?? 20}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-zinc-700">
                            {tender.risk_flags.length === 1
                              ? "1 flag"
                              : `${tender.risk_flags.length} flags`}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-zinc-600">
                            {formatDate(tender.created_at)}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <ButtonGroup>
                              <SbdDownloadButton tenderId={tender.id} form="sbd4" />
                              <SbdDownloadButton tenderId={tender.id} form="sbd61" />
                            </ButtonGroup>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions — left-aligned dense content */}
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
          data-testid="dashboard-quick-actions"
        >
          <Button
            data-testid="manage-documents-btn"
            onClick={() => void navigate({ to: "/documents" })}
            variant="outline"
            size="lg"
            className="h-20 justify-start border-zinc-900 px-6 hover:bg-zinc-900 hover:text-white"
          >
            <FileTextIcon className="!h-6 !w-6" aria-hidden="true" />
            <span className="text-left">
              <span className="block font-bold">Manage Documents</span>
              <span className="block text-xs opacity-70">
                Upload and track compliance documents
              </span>
            </span>
          </Button>
          <Button
            data-testid="edit-profile-btn"
            onClick={() => void navigate({ to: "/setup" })}
            variant="outline"
            size="lg"
            className="h-20 justify-start border-zinc-900 px-6 hover:bg-zinc-900 hover:text-white"
          >
            <Building2Icon className="!h-6 !w-6" aria-hidden="true" />
            <span className="text-left">
              <span className="block font-bold">Edit Company Profile</span>
              <span className="block text-xs opacity-70">
                Update CIPC, CIDB, and B-BBEE details
              </span>
            </span>
          </Button>
          <Button
            data-testid="manage-billing-btn"
            onClick={() => void navigate({ to: "/billing" })}
            variant="outline"
            size="lg"
            className="h-20 justify-start border-zinc-900 px-6 hover:bg-zinc-900 hover:text-white"
          >
            <BanknoteIcon className="!h-6 !w-6" aria-hidden="true" />
            <span className="text-left">
              <span className="block font-bold">Billing &amp; Credits</span>
              <span className="block text-xs opacity-70">View credits and EFT payments</span>
            </span>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {[
            { to: "/setup", label: "Company setup →", testId: "dashboard-link-setup" },
            { to: "/documents", label: "Document vault →", testId: "dashboard-link-documents" },
            { to: "/billing", label: "Billing →", testId: "dashboard-link-billing" },
            { to: "/help", label: "Help →", testId: "dashboard-link-help" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              data-testid={l.testId}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
