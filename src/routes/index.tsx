import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building,
  ChartLine,
  CheckCircle,
  Clock,
  FileText,
  ShieldCheck,
} from "lucide-react";

import { VektorMark } from "@/components/vektor-mark";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { data: rawData, isPending } = authClient.useSession();
  const session = asVektorSession(rawData);

  useEffect(() => {
    if (isPending) return;
    if (session?.user && session.session) {
      if (session.user.role === "admin" && !session.session.impersonatedBy) {
        void navigate({ to: "/admin" });
      } else {
        void navigate({ to: "/app" });
      }
    }
  }, [session, isPending, navigate]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
      <TopNav />
      <main>
        <Hero />
        <SocialProofStrip />
        <FeaturesSection />
        <HowItWorks />
        <ProductProofSection />
        <PricingSection />
        <PartnersSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// ============ Top Nav ============
const TopNav = () => (
  <header
    data-testid="landing-nav"
    className="fixed inset-x-0 top-0 z-50 border-b border-zinc-900 bg-zinc-950"
  >
    <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
      <Link to="/" data-testid="landing-logo" className="flex items-center gap-2.5">
        <VektorMark />
        <span className="text-xl font-bold tracking-tight">Vektor</span>
      </Link>
      <nav className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
        <a
          href="#features"
          data-testid="landing-nav-features"
          className="transition-colors hover:text-white"
        >
          Features
        </a>
        <a
          href="#how-it-works"
          data-testid="landing-nav-how-it-works"
          className="transition-colors hover:text-white"
        >
          How it works
        </a>
        <a
          href="#pricing"
          data-testid="landing-nav-pricing"
          className="transition-colors hover:text-white"
        >
          Pricing
        </a>
        <a
          href="#partners"
          data-testid="landing-nav-partners"
          className="transition-colors hover:text-white"
        >
          Partners
        </a>
        <a href="#faq" data-testid="landing-nav-faq" className="transition-colors hover:text-white">
          FAQ
        </a>
        <Link
          to="/about"
          data-testid="landing-nav-about"
          className="transition-colors hover:text-white"
        >
          About
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <Link
          to="/login"
          search={{}}
          data-testid="landing-signin"
          className="text-sm font-semibold text-zinc-300 transition-colors hover:text-white"
        >
          Sign in
        </Link>
        <Button
          render={<Link to="/signup" search={{ ref: undefined }} data-testid="landing-cta-nav" />}
          className="rounded-sm bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
        >
          Start free
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  </header>
);

// ============ Hero ============
const HERO_CHECKS = [
  { label: "SBD 4 declaration", ok: true },
  { label: "SBD 6.1 B-BBEE points", ok: true },
  { label: "CIDB Grade 6GB", ok: true },
  { label: "Tax clearance current", ok: true },
  { label: "BCCEI Letter of Good Standing", ok: true },
  { label: "COIDA letter of good standing", ok: false },
];

const Hero = () => (
  <section className="relative pt-36 pb-24 lg:pt-44 lg:pb-32" data-testid="landing-hero">
    {/* subtle grid pattern */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
        backgroundSize: "80px 80px",
      }}
    />
    <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-[1.15fr_1fr] lg:px-10">
      <div>
        <p className="mb-6 inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          <span className="inline-block h-px w-6 bg-teal-400" />
          SA Tender Compliance · Built for contractors
        </p>
        <h1 className="text-5xl leading-[1.02] font-black tracking-tight lg:text-7xl">
          Never lose a bid on a<span className="text-teal-400"> technicality</span> again.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-zinc-400 lg:text-xl">
          Vektor scans SA public tender PDFs in seconds, matches them to your{" "}
          <strong className="text-white">CIDB grade</strong>, calculates{" "}
          <strong className="text-white">B-BBEE points</strong>, and flags every missing SBD form
          before you submit. What takes an estimator a week takes Vektor 15 seconds.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button
            render={
              <Link to="/signup" search={{ ref: undefined }} data-testid="landing-hero-cta" />
            }
            size="lg"
            className="rounded-sm bg-teal-500 text-base font-bold text-zinc-950 shadow-lg shadow-teal-500/20 hover:bg-teal-400"
          >
            Start with 1 free analysis
            <ArrowRight aria-hidden="true" />
          </Button>
          <Link
            to="/about"
            data-testid="landing-hero-secondary-cta"
            className="inline-flex items-center gap-1.5 text-base font-semibold text-zinc-300 transition-colors hover:text-white"
          >
            How Vektor works
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-400">
          {["No credit card needed", "Pay by EFT — no gateway fees", "Cancel any time"].map(
            (line) => (
              <span key={line} className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 fill-teal-500 text-teal-500" aria-hidden="true" />
                {line}
              </span>
            ),
          )}
        </div>
      </div>

      {/* Live-looking product mockup — pure CSS, no stock imagery */}
      <div className="relative" data-testid="landing-hero-visual">
        <div className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 shadow-2xl shadow-teal-500/5">
          <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="ml-3 text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
              Analysis · CIDB 6GB · R23.4M
            </span>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] tracking-[0.2em] text-zinc-400 uppercase">Go / No-Go</p>
                <p className="mt-0.5 text-2xl font-bold text-teal-400">GO — 84%</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] tracking-[0.2em] text-zinc-400 uppercase">B-BBEE Points</p>
                <p className="mt-0.5 text-2xl font-bold text-white">22 / 25</p>
              </div>
            </div>
            <div className="space-y-2">
              {HERO_CHECKS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2"
                >
                  <span className="text-xs text-zinc-300">{row.label}</span>
                  {row.ok ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] text-teal-400 uppercase">
                      <CheckCircle className="h-3 w-3 fill-teal-400" aria-hidden="true" /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] text-amber-400 uppercase">
                      <Clock className="h-3 w-3 fill-amber-400" aria-hidden="true" /> Expiring
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Floating notification card */}
        <div className="absolute -bottom-6 -left-6 hidden max-w-xs rounded-md border border-zinc-800 bg-zinc-950 p-4 shadow-2xl lg:block">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-amber-500/30 bg-amber-500/10">
              <Bell className="h-4 w-4 text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Tax clearance expires in 7 days</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                Renew via eFiling before Fri or drop 5 B-BBEE points on your next bid.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ============ Social proof ============
const SocialProofStrip = () => (
  <section
    className="border-y border-zinc-900 bg-zinc-950 py-14"
    data-testid="landing-social-proof"
  >
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <p className="mb-8 text-center text-[10px] font-semibold tracking-[0.25em] text-zinc-400 uppercase">
        Trusted by contractors from Cape Town to Polokwane
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 text-center md:grid-cols-4">
        {[
          { value: "15s", label: "Average analysis time" },
          { value: "R4.2M", label: "Avg tender value screened" },
          { value: "98%", label: "Correct SBD form matches" },
          { value: "0", label: "Missed compliance items" },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-3xl font-black tracking-tight text-white lg:text-4xl">
              {stat.value}
            </p>
            <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============ Features ============
const FEATURES = [
  {
    icon: FileText,
    title: "Instant tender parsing",
    body: "Drop any RFP or SBD-packed PDF. Vektor extracts scope, budget, CIDB grade, closing date, and every mandatory returnable in under 15 seconds.",
  },
  {
    icon: ShieldCheck,
    title: "CIDB grade matching",
    body: "Auto-matches the tender to your registered CIDB grades and CoR classes. If you don't qualify, Vektor tells you before you waste hours drafting.",
  },
  {
    icon: ChartLine,
    title: "B-BBEE points calculator",
    body: "Live scoring for the 90/10 or 80/20 preference systems. See exactly how many points your Level earns on this specific tender.",
  },
  {
    icon: FileText,
    title: "SBD 4 & 6.1 auto-generation",
    body: "Vektor pre-fills the SBD 4 declaration and SBD 6.1 B-BBEE affidavit with your company data — including the authorised signatory's name and position. Sign, upload, submit.",
  },
  {
    icon: ShieldCheck,
    title: "Bargaining Council checks",
    body: "Every SA construction tender falls under a sectoral council — BCCEI for civil, NBCEI for electrical, MEIBC for mechanical, regional BIBCs for building. Vektor auto-detects the right one and flags a missing Letter of Good Standing before you submit.",
  },
  {
    icon: Bell,
    title: "Expiry alerts",
    body: "Tax clearance, CIDB registration, COIDA, B-BBEE certificate, Bargaining Council letter — Vektor emails you at 30, 7, and 0 days before each expires.",
  },
  {
    icon: Building,
    title: "Document vault",
    body: "One secure home for every statutory document your company needs on-hand. Attach directly to any tender analysis in one click.",
  },
];

const FeaturesSection = () => (
  <section id="features" className="bg-zinc-950 py-24 lg:py-32" data-testid="landing-features">
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="mb-14 max-w-2xl">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          What you get
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          Six weeks of compliance work,{" "}
          <span className="text-teal-400">done before your coffee cools.</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            data-testid={`landing-feature-${f.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            className="group rounded-md border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-teal-500/50 hover:bg-zinc-900/80"
          >
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-sm border border-teal-500/30 bg-teal-500/10 transition-colors group-hover:bg-teal-500/20">
              <f.icon className="h-5 w-5 text-teal-400" aria-hidden="true" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">{f.title}</h3>
            <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============ How it works ============
const STEPS = [
  {
    n: "01",
    title: "Set up your company profile",
    body: "Enter your CIDB grades, B-BBEE level, and CIPC registration once. Vektor uses this on every future analysis.",
  },
  {
    n: "02",
    title: "Upload any tender PDF",
    body: "Drag in the tender document. Vektor reads it, understands it, and shows a compliance scorecard in under 15 seconds.",
  },
  {
    n: "03",
    title: "Fix the flags, submit with confidence",
    body: "One-click SBD form generation, expiry-aware document attachments, and a printable bid pack. Never miss a returnable.",
  },
];

const HowItWorks = () => (
  <section id="how-it-works" className="bg-zinc-900/60 py-24 lg:py-32" data-testid="landing-how">
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="mb-14 max-w-2xl">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          How Vektor works
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          From RFP to submission, <span className="text-teal-400">in three steps.</span>
        </h2>
      </div>
      <div className="space-y-8 lg:space-y-6">
        {STEPS.map((step) => (
          <div
            key={step.n}
            data-testid={`landing-step-${step.n}`}
            className="grid items-start gap-4 rounded-md border border-zinc-800 bg-zinc-950 p-6 lg:grid-cols-[120px_1fr] lg:gap-10 lg:p-8"
          >
            <p aria-hidden="true" className="text-5xl font-black text-teal-400/70 lg:text-6xl">
              {step.n}
            </p>
            <div>
              <h3 className="mb-2 text-xl font-bold text-white lg:text-2xl">{step.title}</h3>
              <p className="max-w-2xl text-base leading-relaxed text-zinc-400">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============ Product proof / expiry timeline ============
const TIMELINE_ROWS = [
  { doc: "SARS Tax Clearance PIN", days: 3, level: "critical" as const },
  { doc: "CIDB Grade 6GB Certificate", days: 18, level: "warn" as const },
  { doc: "COIDA Letter of Good Standing", days: 47, level: "ok" as const },
  { doc: "B-BBEE Affidavit (Level 2)", days: 89, level: "ok" as const },
  { doc: "CIPC Company Registration", days: 231, level: "ok" as const },
];

const ProductProofSection = () => (
  <section className="bg-zinc-950 py-24 lg:py-32" data-testid="landing-proof">
    <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-24 lg:px-10">
      <div className="order-2 lg:order-1">
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <p className="mb-4 text-[9px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            Document Vault · Expiry Timeline
          </p>
          <div className="space-y-3">
            {TIMELINE_ROWS.map((row) => {
              const barClass =
                row.level === "critical"
                  ? "bg-red-500"
                  : row.level === "warn"
                    ? "bg-amber-500"
                    : "bg-teal-500";
              return (
                <div key={row.doc}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">{row.doc}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
                        row.level === "critical"
                          ? "text-red-400"
                          : row.level === "warn"
                            ? "text-amber-400"
                            : "text-zinc-400"
                      }`}
                    >
                      {row.days} days
                    </span>
                  </div>
                  <Progress
                    value={row.days}
                    aria-label={`${row.doc} expires in ${row.days} days`}
                    className="h-1 gap-0"
                  >
                    <ProgressTrack className="h-1 rounded-full bg-zinc-800">
                      <ProgressIndicator className={`h-full ${barClass}`} />
                    </ProgressTrack>
                  </Progress>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          Compliance vault
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          Your statutory documents, one calendar away from a lost bid.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-zinc-400 lg:text-lg">
          Vektor tracks every document expiry date and emails you at 30, 7, and 0 days. When a
          tender needs a document you don&rsquo;t have on file, we tell you exactly which one before
          you burn a week drafting the response.
        </p>
        <ul className="mt-8 space-y-3">
          {[
            "Auto-detect document type from filename & content",
            "Regex validation on CIPC, SARS PIN, MAAA, CIDB numbers",
            "Attach any document to a tender bid in one click",
            "Full audit trail — nothing goes missing",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <CheckCircle
                className="mt-0.5 h-4 w-4 shrink-0 fill-teal-500 text-teal-500"
                aria-hidden="true"
              />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

// ============ Pricing ============
const PLANS = [
  {
    name: "Starter",
    price: "R399",
    period: "/ month",
    persona: "Freelancers & occasional tender bidders",
    credits: "5 analyses included",
    features: ["Standard compliance check", "Full PDF audit report", "Email support"],
    testId: "starter",
  },
  {
    name: "Pro",
    price: "R1,299",
    period: "/ month",
    persona: "Growing businesses bidding monthly",
    credits: "20 analyses included",
    features: ["Priority compliance check", "Full PDF audit report", "Priority support"],
    highlight: true,
    testId: "pro",
  },
  {
    name: "Scale",
    price: "R2,499",
    period: "/ month",
    persona: "Active contractors & high-volume vendors",
    credits: "50 analyses included",
    features: ["Fast-track processing", "Full PDF audit report", "Dedicated support"],
    testId: "scale",
  },
];

const PricingSection = () => (
  <section id="pricing" className="bg-zinc-900/60 py-24 lg:py-32" data-testid="landing-pricing">
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="mb-14 max-w-2xl">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          Pricing
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          Every plan comes with <span className="text-teal-400">every feature.</span>
        </h2>
        <p className="mt-5 text-base leading-relaxed text-zinc-400">
          You only pay for how many tenders you analyse. All plans include the vault, SBD forms,
          B-BBEE scoring, and expiry alerts. Pay by EFT direct to our FNB account — zero card fees.
        </p>
      </div>
      <div className="grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            data-testid={`pricing-card-${p.testId}`}
            className={`relative rounded-md border p-7 ${
              p.highlight ? "border-teal-500 bg-teal-500/5" : "border-zinc-800 bg-zinc-950"
            }`}
          >
            {p.highlight && (
              <p className="absolute -top-3 left-6 rounded-sm bg-teal-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-950">
                Most popular
              </p>
            )}
            <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase">
              {p.name}
            </p>
            <div className="mb-1 flex items-baseline gap-1">
              <span className="text-3xl font-black text-white">{p.price}</span>
              <span className="text-sm text-zinc-400">{p.period}</span>
            </div>
            <p className="mb-2 text-xs text-zinc-400">{p.credits}</p>
            <p className="mb-5 min-h-[32px] text-[11px] leading-snug text-zinc-400">{p.persona}</p>
            <ul className="mb-6 min-h-[100px] space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                  <CheckCircle
                    className="mt-0.5 h-3 w-3 shrink-0 fill-teal-500 text-teal-500"
                    aria-hidden="true"
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              render={
                <Link
                  to="/signup"
                  search={{ ref: undefined }}
                  data-testid={`pricing-cta-${p.testId}`}
                />
              }
              className={`w-full rounded-sm text-sm font-bold ${
                p.highlight
                  ? "bg-teal-500 text-zinc-950 hover:bg-teal-400"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              Start free
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-zinc-300" data-testid="landing-payg-caption">
        Prefer to pay per bid? Grab a{" "}
        <span className="font-semibold text-white">Single Analysis pack for R149</span> — one
        credit, no subscription, perfect for quick one-off tender checks.
      </p>
      <p className="mt-3 text-[11px] text-zinc-400">
        Payments are facilitated by{" "}
        <span className="font-semibold text-zinc-400">EcoBuiltConnect (Pty) Ltd</span> via secure
        EFT to a First National Bank business account.
      </p>
    </div>
  </section>
);

// ============ Partners ============
const PARTNERS = [
  {
    name: "EcoBuiltConnect (Pty) Ltd",
    role: "Payment operations & compliance",
    description:
      "Handles all EFT payment facilitation, transaction reconciliation, and Vektor's day-to-day operational compliance. Vektor is a product operated by EcoBuiltConnect.",
    logo: "/partners/ecobuiltconnect.webp",
    fallbackInitials: "EBC",
    href: "https://www.ecobuiltconnect.co.za",
  },
  {
    name: "EP Technologies",
    role: "Efficiency Power Technologies",
    description:
      "Registration 2022/653768/07 — a South African partner specialising in efficiency power technologies.",
    logo: "/partners/eptechnologies.jpg",
    fallbackInitials: "EPT",
    email: "admin@epinvtech.net",
  },
];

function PartnerLogo({ logo, initials }: { logo?: string; initials: string }) {
  const [broken, setBroken] = useState(false);
  if (!logo || broken) {
    return (
      <div className="flex h-32 items-center justify-center border-b border-teal-500/30 bg-teal-500/10">
        <span className="text-4xl font-black tracking-[0.05em] text-teal-400">{initials}</span>
      </div>
    );
  }
  return (
    <div className="flex h-32 items-center justify-center border-b border-zinc-800 bg-white px-6 py-4">
      <img
        src={logo}
        alt=""
        className="max-h-full max-w-full object-contain"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

const PartnersSection = () => (
  <section id="partners" className="bg-zinc-950 py-24 lg:py-32" data-testid="landing-partners">
    <div className="mx-auto max-w-7xl px-6 lg:px-10">
      <div className="mb-14 max-w-2xl">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          Partners
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          Backed by trusted South African <span className="text-teal-400">partners.</span>
        </h2>
        <p className="mt-5 text-base leading-relaxed text-zinc-400">
          Vektor is built and operated in partnership with organisations that share our mission of
          raising the bar for South African contractor compliance.
        </p>
      </div>
      <div className="grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
        {PARTNERS.map((p) => (
          <div
            key={p.name}
            data-testid={`landing-partner-${p.name.replace(/\s+/g, "-").toLowerCase()}`}
            className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60"
          >
            <PartnerLogo logo={p.logo} initials={p.fallbackInitials} />
            <div className="p-6">
              <p className="mb-1 text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase">
                {p.role}
              </p>
              <h3 className="mb-2 text-lg font-black leading-tight text-white">{p.name}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{p.description}</p>
              {"href" in p && p.href && (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`landing-partner-link-${p.name.replace(/\s+/g, "-").toLowerCase()}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal-400 transition-colors hover:text-teal-300"
                >
                  Visit website <ArrowRight aria-hidden="true" />
                </a>
              )}
              {"email" in p && p.email && (
                <a
                  href={`mailto:${p.email}`}
                  data-testid={`landing-partner-email-${p.name.replace(/\s+/g, "-").toLowerCase()}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal-400 transition-colors hover:text-teal-300"
                >
                  {p.email} <ArrowRight aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============ FAQ ============
const FAQ = [
  {
    q: "Do I need a payment gateway to buy credits?",
    a: "No. Vektor uses direct EFT to our First National Bank business account. You get a unique reference number, do the EFT from your bank app, upload proof of payment, and we activate your credits within one business day. Zero card fees.",
  },
  {
    q: "How does Vektor know my company's CIDB grade or B-BBEE level?",
    a: "You enter it once during company setup — CIPC number, CIDB grades, B-BBEE level (1–8), and other statutory details. Vektor uses this for every future tender analysis. All data stays in your account and is never shared.",
  },
  {
    q: "What happens if I don't qualify for a tender I upload?",
    a: 'Vektor tells you immediately — usually within 15 seconds. We flag the specific gap (e.g. "needs CIDB Grade 7 CE, you have Grade 5") so you can walk away before wasting time on the response.',
  },
  {
    q: "Are the SBD 4 and SBD 6.1 forms Treasury-compliant?",
    a: "Yes. Vektor pre-fills the current National Treasury SBD 4 (Declaration of Interest) and SBD 6.1 (B-BBEE Preference Points Claim) templates using your company profile. You review, sign, and upload back to the buyer.",
  },
  {
    q: "How current are your compliance rules?",
    a: "We track updates to the PPPFA regulations, CIDB Act amendments, and B-BBEE Codes of Good Practice quarterly. Any change to preference point scoring or mandatory returnables is reflected within 7 days.",
  },
  {
    q: "Can multiple estimators share one account?",
    a: "We're rolling out team seats in the next release. For now, one email per account. If you need multi-user access urgently, email us — we'll set you up manually.",
  },
];

const FaqSection = () => (
  <section id="faq" className="bg-zinc-950 py-24 lg:py-32" data-testid="landing-faq">
    <div className="mx-auto max-w-4xl px-6 lg:px-10">
      <div className="mb-12">
        <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
          Common questions
        </p>
        <h2 className="text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
          The important stuff, up front.
        </h2>
      </div>
      <Accordion className="border-y border-zinc-800">
        {FAQ.map((row) => (
          <AccordionItem key={row.q} value={row.q} data-testid={`landing-faq-item`}>
            <AccordionTrigger className="py-6 text-base font-bold text-white hover:text-teal-400 hover:no-underline lg:text-lg">
              {row.q}
            </AccordionTrigger>
            <AccordionContent className="pb-6 text-sm leading-relaxed text-zinc-400 lg:text-base">
              {row.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

// ============ Final CTA ============
const FinalCta = () => (
  <section className="bg-zinc-950 py-24 lg:py-32" data-testid="landing-final-cta">
    <div className="mx-auto max-w-5xl px-6 lg:px-10">
      <div className="relative overflow-hidden rounded-md border border-teal-500/30 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(45,212,191,0.15) 0%, transparent 40%)",
          }}
        />
        <div className="relative">
          <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
            Ready when you are
          </p>
          <h2 className="max-w-2xl text-4xl leading-[1.05] font-black tracking-tight lg:text-5xl">
            Your next bid could go <span className="text-teal-400">out this afternoon.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-400 lg:text-lg">
            Start with 1 free tender analysis. No credit card, no setup call, no gateway
            integration. Just paste in a PDF and see what Vektor finds.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              render={
                <Link
                  to="/signup"
                  search={{ ref: undefined }}
                  data-testid="landing-final-cta-btn"
                />
              }
              size="lg"
              className="rounded-sm bg-teal-500 text-base font-bold text-zinc-950 shadow-lg shadow-teal-500/20 hover:bg-teal-400"
            >
              Start with 1 free analysis
              <ArrowRight aria-hidden="true" />
            </Button>
            <Link
              to="/login"
              search={{}}
              data-testid="landing-final-cta-signin"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-zinc-300 transition-colors hover:text-white"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ============ Footer ============
function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; to?: string; href?: string }>;
}) {
  return (
    <div>
      <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase">
        {title}
      </p>
      <ul className="space-y-2.5">
        {links.map((l) =>
          l.to ? (
            <li key={l.label}>
              <Link
                to={l.to}
                className="text-sm text-zinc-300 transition-colors hover:text-teal-400"
              >
                {l.label}
              </Link>
            </li>
          ) : (
            <li key={l.label}>
              <a
                href={l.href}
                className="text-sm text-zinc-300 transition-colors hover:text-teal-400"
              >
                {l.label}
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

const Footer = () => (
  <footer className="border-t border-zinc-900 bg-zinc-950 py-14" data-testid="landing-footer">
    <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] lg:px-10">
      <div>
        <div className="mb-4 flex items-center gap-2.5">
          <VektorMark />
          <span className="text-xl font-bold tracking-tight">Vektor</span>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-zinc-400">
          Automated tender compliance for South African contractors. Built in Cape Town, made for
          every construction firm from Polokwane to Port Elizabeth.
        </p>
        <p className="mt-4 text-[11px] text-zinc-400">
          © {new Date().getFullYear()} EcoBuiltConnect (Pty) Ltd — All rights reserved. Vektor™ is a
          trade mark of EcoBuiltConnect (Pty) Ltd.
        </p>
      </div>
      <FooterCol
        title="Product"
        links={[
          { label: "Features", href: "#features" },
          { label: "Pricing", href: "#pricing" },
          { label: "How it works", href: "#how-it-works" },
          { label: "Partners", href: "#partners" },
        ]}
      />
      <FooterCol
        title="Company"
        links={[
          { label: "About", to: "/about" },
          { label: "Sign in", to: "/login" },
          { label: "Start free", to: "/signup" },
        ]}
      />
      <FooterCol
        title="Legal"
        links={[
          { label: "Terms of Service", to: "/terms" },
          { label: "Privacy Policy", to: "/privacy" },
        ]}
      />
      <FooterCol
        title="Support"
        links={[
          { label: "support@vektorhq.co.za", href: "mailto:support@vektorhq.co.za" },
          { label: "Help & walkthrough", to: "/help" },
        ]}
      />
    </div>
  </footer>
);
