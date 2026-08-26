import { createFileRoute, Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "@/components/admin-layout";
import { AppSidebar } from "@/components/app-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { VektorMark } from "@/components/vektor-mark";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

type WalkthroughSlide = {
  chapter: number;
  title: string;
  caption: string;
  image: string;
};

const WALKTHROUGH_SLIDES: WalkthroughSlide[] = [
  {
    chapter: 1,
    title: "Welcome to Vektor",
    caption: "Your automated compliance co-pilot for South African public tenders.",
    image: "/help-slides/dashboard.jpg",
  },
  {
    chapter: 2,
    title: "Step 1 — Set up your company",
    caption:
      "Enter your CIPC, CSD/MAAA, SARS TCS PIN, CIDB grades and B-BBEE level. We validate the format live and link you to the official portals.",
    image: "/help-slides/setup.jpg",
  },
  {
    chapter: 3,
    title: "Step 2 — Load your compliance documents",
    caption:
      "Upload Tax Clearance, COIDA, B-BBEE, your Bargaining Council Letter of Good Standing, and director IDs. We track expiry and flag risks automatically.",
    image: "/help-slides/documents.jpg",
  },
  {
    chapter: 4,
    title: "Step 3 — Know your Bargaining Council",
    caption:
      "Every SA construction tender falls under a sectoral council. Civil under BCCEI, electrical under NBCEI, mechanical under MEIBC, and building under a regional BIBC. Vektor warns you if the required letter is missing.",
    image: "/help-slides/documents.jpg",
  },
  {
    chapter: 5,
    title: "Step 4 — Analyze a tender",
    caption:
      "Drop in the tender PDF. Our compliance engine extracts the required CIDB grade, closing date, and mandatory returnables in seconds.",
    image: "/help-slides/analyze.jpg",
  },
  {
    chapter: 6,
    title: "Step 5 — Review Fit Score & Go / No-Go",
    caption:
      "See your fit score, B-BBEE points, and any disqualification risks on a single dashboard.",
    image: "/help-slides/analyze.jpg",
  },
  {
    chapter: 7,
    title: "Step 6 — Auto-fill SBD forms",
    caption:
      "One-click download of SBD 4 and SBD 6.1 pre-filled with your company vault details, including the authorised signatory name and position.",
    image: "/help-slides/analyze.jpg",
  },
  {
    chapter: 8,
    title: "Track everything in Recent Activity",
    caption:
      "Every analysis, EFT payment, and referral reward lives one glance away on your dashboard.",
    image: "/help-slides/dashboard.jpg",
  },
  {
    chapter: 9,
    title: "Pay by EFT — no card fees",
    caption:
      "Start with 1 free credit. Top up with a R149 single analysis or subscribe to Starter, Pro, or Scale.",
    image: "/help-slides/billing.jpg",
  },
  {
    chapter: 10,
    title: "Earn credits with referrals",
    caption:
      "Invite a friend. When they upgrade to a paid plan you unlock free credits — up to 10 per referral.",
    image: "/help-slides/billing.jpg",
  },
];

function QuickStartCard({
  number,
  title,
  body,
  testId,
}: {
  number: number;
  title: string;
  body: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-sm border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400"
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-teal-700 text-white">
          <span className="text-sm font-bold">{number}</span>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Step {number}
          </div>
          <h3 className="mb-1 text-base font-bold text-zinc-900">{title}</h3>
          <p className="text-sm leading-relaxed text-zinc-600">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ReferenceSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8" data-testid={`ref-section-${id}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-zinc-900" aria-hidden>
          •
        </span>
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      </div>
      <div className="prose prose-sm max-w-none leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

function HelpContent() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
      {/* Static walkthrough — no TTS */}
      <section data-testid="help-walkthrough-section">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold tracking-tight">Static walkthrough — 10 chapters</h2>
          <span className="text-xs font-semibold tracking-[0.15em] text-zinc-600 uppercase">
            No audio · Captions only
          </span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-zinc-600">
          Browse each chapter at your own pace. Images are from your actual product screens —
          dashboard, setup, vault, analyze, and billing — so you see the real workflow, not stock
          photos.
        </p>
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          data-testid="walkthrough-slides-grid"
        >
          {WALKTHROUGH_SLIDES.map((slide) => (
            <div
              key={slide.chapter}
              data-testid={`walkthrough-slide-${slide.chapter}`}
              className="overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-none"
            >
              <div className="relative bg-zinc-950">
                <AspectRatio ratio={16 / 10}>
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className="h-full w-full object-cover object-top opacity-95"
                    data-testid="walkthrough-slide-image"
                    loading="lazy"
                  />
                </AspectRatio>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent p-4 text-white">
                  <div className="mb-1 text-xs font-semibold tracking-[0.2em] text-zinc-300 uppercase">
                    Chapter {slide.chapter} / {WALKTHROUGH_SLIDES.length}
                  </div>
                  <h3
                    className="text-base font-bold leading-tight"
                    data-testid="walkthrough-slide-title"
                  >
                    {slide.title}
                  </h3>
                </div>
              </div>
              <div className="p-4">
                <p
                  className="text-sm leading-relaxed text-zinc-600"
                  data-testid="walkthrough-slide-caption"
                >
                  {slide.caption}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          Each chapter pairs a slide with a short caption — read the walkthrough at your own pace.
        </p>
      </section>

      {/* Quick-start */}
      <section data-testid="help-quickstart-section">
        <h2 className="mb-4 text-xl font-bold tracking-tight">
          Quick-start — 5 minutes to first bid
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <QuickStartCard
            number={1}
            title="Create your company profile"
            body="Head to Company Setup, enter CIPC + CSD MAAA + SARS TCS PIN + B-BBEE level. Live regex checks stop typos before they cost you a bid."
            testId="qs-step-1"
          />
          <QuickStartCard
            number={2}
            title="Load compliance documents"
            body="Upload your Tax Clearance PIN, COIDA letter, B-BBEE cert, and Director IDs to the Document Vault. Expiry alerts are automatic."
            testId="qs-step-2"
          />
          <QuickStartCard
            number={3}
            title="Upload the tender PDF"
            body="Open Analyze Tender, drop the RFP, pick 80/20 or 90/10 preference. One credit is deducted (refunded if the analysis fails)."
            testId="qs-step-3"
          />
          <QuickStartCard
            number={4}
            title="Review Fit Score & risk flags"
            body="A dashboard shows CIDB match, B-BBEE points, mandatory returnables, and a Go / No-Go gauge — instantly."
            testId="qs-step-4"
          />
          <QuickStartCard
            number={5}
            title="Download pre-filled SBD forms"
            body="One-click SBD 4 and SBD 6.1 PDFs, populated with your vault details. Print, sign, submit."
            testId="qs-step-5"
          />
          <QuickStartCard
            number={6}
            title="Top up credits when needed"
            body="Buy a Single Analysis credit (R149) or subscribe monthly — Starter, Pro, or Scale. Cancel any time from the Billing tab."
            testId="qs-step-6"
          />
        </div>
      </section>

      {/* Full reference */}
      <section data-testid="help-reference-section" className="space-y-8">
        <h2 className="text-xl font-bold tracking-tight">Full feature reference</h2>

        <ReferenceSection id="company" title="Company Profile & Statutory Vault">
          <p>
            Every South African public tender requires a bidder identity that matches the CIPC, CSD
            and SARS registers. On the Company Setup screen we validate every statutory field the
            moment you type:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <strong>CIPC number</strong> must match <code>YYYY/NNNNNN/TT</code>. We derive your
              incorporation year and entity type (Pty Ltd, NPC, CC, etc.) from the code.
            </li>
            <li>
              <strong>CSD MAAA</strong> follows <code>MAAA</code> + 7 digits and is
              case-insensitive.
            </li>
            <li>
              <strong>SARS TCS PIN</strong> is 9–10 alphanumeric characters, normalised to
              uppercase.
            </li>
          </ul>
          <p className="mt-2">
            Each field ships with an “Open official portal” deep-link so you can cross-verify with
            the source of truth.
          </p>
          <p className="mt-3">
            <a
              href="https://esearch.cipc.co.za/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="help-cipc-link"
              className="font-semibold text-zinc-900 underline underline-offset-2"
            >
              CIPC eSearch — verify company registration ↗
            </a>
            {" · "}
            <a
              href="https://secure.csd.gov.za/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="help-csd-link"
              className="font-semibold text-zinc-900 underline underline-offset-2"
            >
              National Treasury CSD (MAAA) portal ↗
            </a>
            {" · "}
            <a
              href="https://tools.sars.gov.za/tcc/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="help-sars-link"
              className="font-semibold text-zinc-900 underline underline-offset-2"
            >
              SARS Tax Compliance Status portal ↗
            </a>
          </p>
        </ReferenceSection>

        <ReferenceSection id="documents" title="Document Vault & Expiry Alerts">
          <p>
            The Vault stores your Tax Clearance PIN, COIDA Letter of Good Standing, B-BBEE affidavit
            or certificate, Bargaining Council Letter of Good Standing, and Director ID copies.
            Uploads are streamed to secure R2 storage. We compute days-to-expiry per document and
            colour-code anything within 30 days as amber, and anything already expired as red —
            before the SBD form flags it for you.
          </p>
        </ReferenceSection>

        <ReferenceSection id="bargaining" title="Bargaining Council Compliance">
          <p>
            Every SA construction tender falls under one or more sectoral bargaining councils. You
            must be registered <em>and</em> in good standing (levies paid, no compliance findings)
            with the relevant council or your bid can be disqualified — even when every other
            document is perfect.
          </p>
          <div className="mt-3 overflow-x-auto">
            <Table className="border border-zinc-200 text-sm">
              <TableHeader className="bg-zinc-50 text-xs tracking-[0.1em] text-zinc-600 uppercase">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="border-b border-zinc-200 px-3 py-2 text-left">
                    CIDB Class
                  </TableHead>
                  <TableHead className="border-b border-zinc-200 px-3 py-2 text-left">
                    Applicable Council
                  </TableHead>
                  <TableHead className="border-b border-zinc-200 px-3 py-2 text-left">
                    Scope
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-zinc-100">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 font-mono whitespace-normal">CE</TableCell>
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <a
                      className="text-teal-700 underline"
                      href="https://www.bccei.co.za"
                      target="_blank"
                      rel="noreferrer"
                      data-testid="help-bccei-link"
                    >
                      BCCEI — Civil Engineering
                    </a>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">National</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 font-mono whitespace-normal">EB / EP</TableCell>
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <a
                      className="text-teal-700 underline"
                      href="https://www.nbcei.co.za"
                      target="_blank"
                      rel="noreferrer"
                      data-testid="help-nbcei-link"
                    >
                      NBCEI — Electrical
                    </a>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">National</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 font-mono whitespace-normal">ME</TableCell>
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <a
                      className="text-teal-700 underline"
                      href="https://www.meibc.co.za"
                      target="_blank"
                      rel="noreferrer"
                      data-testid="help-meibc-link"
                    >
                      MEIBC — Mechanical / HVAC
                    </a>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      HVAC also needs SARACCA + SAQCC Gas registration
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">National</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 font-mono" rowSpan={5}>
                    GB
                  </TableCell>
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <a
                      className="text-teal-700 underline"
                      href="https://www.bibc.co.za"
                      target="_blank"
                      rel="noreferrer"
                    >
                      BIBC (Cape of Good Hope)
                    </a>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">Western Cape</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 whitespace-normal">
                    <a
                      className="text-teal-700 underline"
                      href="https://www.bibcpe.co.za"
                      target="_blank"
                      rel="noreferrer"
                    >
                      BIBC (Southern &amp; Eastern Cape)
                    </a>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">
                    Southern &amp; Eastern Cape
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 whitespace-normal">BIBC (East London)</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">East London / Border</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 whitespace-normal">BIBC (Kimberley)</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">
                    Kimberley / Northern Cape
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 whitespace-normal">BCBI (Bloemfontein)</TableCell>
                  <TableCell className="px-3 py-2 text-zinc-600">
                    Bloemfontein / Free State
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            Upload your current Letter of Good Standing to the Compliance Document Vault as document
            type <strong>Bargaining Council Letter of Good Standing</strong>. Tender analysis will
            automatically raise a warning when a tender falls under a council but no letter is on
            file.
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Verify CIDB grades at{" "}
            <a
              href="https://registers.cidb.org.za"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="help-cidb-link"
              className="font-semibold text-zinc-900 underline underline-offset-2"
            >
              CIDB Registers of Contractors ↗
            </a>
            .
          </p>
        </ReferenceSection>

        <ReferenceSection id="analyze" title="Tender Analysis Engine">
          <p>
            Drop any RFP PDF onto Analyze Tender. We extract text from the first 10 pages and run it
            through our compliance engine. Within seconds we return:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Tender title, number, issuing entity, and closing date</li>
            <li>Required CIDB grade (e.g. 4GB)</li>
            <li>Every mandatory returnable (SBD forms, Tax PIN, CSD report, etc.)</li>
          </ul>
          <p className="mt-2">
            We then cross-reference against your Company + Vault to compute a Fit Score, B-BBEE
            points (80/20 or 90/10), and any disqualification risk flags.
          </p>
        </ReferenceSection>

        <ReferenceSection id="gauge" title="Go / No-Go Gauge & Compliance Checklist">
          <p>
            The Go / No-Go gauge is a single glance at bid feasibility. It fuses the Fit Score with
            the returnable checklist — tick each returnable off as you gather it, or upload evidence
            to auto-verify. Once every item is green, you&apos;re clear to submit.
          </p>
        </ReferenceSection>

        <ReferenceSection id="sbd" title="Auto-generated SBD Forms">
          <p>
            From any analysed tender you can download SBD 4 (Declaration of Interest) and SBD 6.1
            (Preference Point Claim) — auto-populated with your company vault details, ready for
            signature. More SBD templates (1, 8, 9) are on the roadmap.
          </p>
        </ReferenceSection>

        <ReferenceSection id="billing" title="Credits & Subscriptions">
          <p>
            New companies start with <strong>1 free tender analysis</strong>. Each Analyze Tender
            run consumes one credit. If extraction fails (unparseable JSON, PDF error, timeout), we
            refund the credit automatically. Top up with a{" "}
            <strong>Single Analysis pack (R149)</strong> or subscribe monthly —{" "}
            <strong>Starter R399</strong>, <strong>Pro R1,299</strong>, or{" "}
            <strong>Scale R2,499</strong> — all in ZAR, paid by EFT directly to our bank account (no
            gateway fees). Payments are facilitated by EcoBuiltConnect (Pty) Ltd via First National
            Bank; credits are added within 1 business day of verification.
          </p>
        </ReferenceSection>

        <ReferenceSection id="portals" title="Official verification portals">
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <a
                href="https://esearch.cipc.co.za/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-portal-cipc"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                CIPC eSearch — verify company registration
              </a>
            </li>
            <li>
              <a
                href="https://tools.sars.gov.za/tcc/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-portal-sars"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                SARS Tax Compliance Status portal
              </a>
            </li>
            <li>
              <a
                href="https://secure.csd.gov.za/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-portal-csd"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                National Treasury CSD (MAAA) portal
              </a>
            </li>
            <li>
              <a
                href="https://registers.cidb.org.za/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-portal-cidb"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                CIDB Registers of Contractors
              </a>
            </li>
          </ul>
        </ReferenceSection>
      </section>
    </div>
  );
}

function PublicHeader() {
  return (
    <header
      data-testid="help-header"
      className="sticky top-0 z-20 border-b border-zinc-200 bg-white"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" data-testid="help-brand-link" className="flex items-center gap-2.5">
          <VektorMark className="h-7 w-7 text-sm" />
          <span className="text-xl font-bold tracking-tight">Vektor</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/about"
            data-testid="help-nav-about"
            className="font-semibold text-zinc-700 hover:text-zinc-900"
          >
            About
          </Link>
          <Link
            to="/terms"
            data-testid="help-nav-terms"
            className="font-medium text-zinc-600 hover:text-zinc-900"
          >
            Terms
          </Link>
          <Link
            to="/privacy"
            data-testid="help-nav-privacy"
            className="font-medium text-zinc-600 hover:text-zinc-900"
          >
            Privacy
          </Link>
          <Link
            to="/login"
            search={{}}
            data-testid="help-nav-login"
            className="rounded-sm bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function HelpPage() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="text-sm font-semibold tracking-[0.2em] text-zinc-600 uppercase">
          Loading…
        </div>
      </div>
    );
  }

  const vektorSession = asVektorSession(session);
  const isAuthed = Boolean(vektorSession?.user);
  const isAdmin = vektorSession?.user?.role === "admin" && !vektorSession.session?.impersonatedBy;

  if (isAdmin) {
    return (
      <AdminShell>
        <header data-testid="help-header-authed" className="border-b border-zinc-700 pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            <span aria-hidden>?</span> Help &amp; Guides
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            How to use Vektor
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            A static walkthrough, a quick-start checklist, and a full feature reference — everything
            you need to bid smarter. No audio narration, just captions and screenshots.
          </p>
        </header>
        <div className="mt-6 rounded-sm bg-zinc-50 text-zinc-950">
          <HelpContent />
        </div>
      </AdminShell>
    );
  }

  if (isAuthed) {
    return (
      <>
        <ImpersonationBanner />
        <SidebarProvider
          className="min-h-svh"
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar": "#18181b",
              "--sidebar-foreground": "#fafafa",
              "--sidebar-accent": "#27272a",
              "--sidebar-accent-foreground": "#fafafa",
              "--sidebar-border": "#27272a",
            } as CSSProperties
          }
        >
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-background">
            <header
              data-testid="help-header-authed"
              className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6"
            >
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-zinc-600 uppercase">
                <span aria-hidden>?</span> Help &amp; Guides
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                How to use Vektor
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
                A static walkthrough, a quick-start checklist, and a full feature reference —
                everything you need to bid smarter. No audio narration, just captions and
                screenshots.
              </p>
            </header>
            <HelpContent />
          </SidebarInset>
        </SidebarProvider>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50" data-testid="help-page">
      <PublicHeader />
      <main>
        <div className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-600 uppercase">
              Help &amp; Guides
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              How to use Vektor
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              A static walkthrough, a quick-start checklist, and a full feature reference —
              everything you need to bid smarter. No audio narration, just captions and screenshots.
            </p>
          </div>
        </div>
        <HelpContent />
      </main>
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-zinc-500 md:flex-row">
          <span>© {new Date().getFullYear()} Vektor · SA Tender Compliance</span>
          <div className="flex items-center gap-5">
            <Link to="/about" data-testid="help-footer-about" className="hover:text-zinc-900">
              About
            </Link>
            <Link to="/terms" data-testid="help-footer-terms" className="hover:text-zinc-900">
              Terms
            </Link>
            <Link to="/privacy" data-testid="help-footer-privacy" className="hover:text-zinc-900">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
