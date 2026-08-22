import { createFileRoute, Link } from "@tanstack/react-router";
import { HandshakeIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const HOW_WE_HELP = [
  {
    title: "Stay ready — don't scramble",
    body: "Continuous compliance monitoring so you're never caught off-guard when a tender drops.",
    testId: "about-help-stay",
  },
  {
    title: "Surface risks before they cost you",
    body: "Automated analysis flags expired documents, missing forms, and disqualifying details in seconds.",
    testId: "about-help-surface",
  },
  {
    title: "Turn complexity into clear next steps",
    body: "We translate legal requirements and SBD forms into an actionable checklist — no guesswork.",
    testId: "about-help-turn",
  },
  {
    title: "Confidence when opportunity appears",
    body: "Know your house is in order every time a bid deadline shows up. Focus on the price, not the paperwork.",
    testId: "about-help-confidence",
  },
];

const PROMISE = [
  { label: "Clear compliance", testId: "about-promise-clear" },
  { label: "Fewer disqualifications", testId: "about-promise-fewer" },
  { label: "More time winning work", testId: "about-promise-more" },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-white" data-testid="about-page">
      {/* Solid header — never transparent over scrolled content */}
      <header
        data-testid="about-header"
        className="sticky top-0 z-20 border-b border-zinc-200 bg-white"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" data-testid="about-brand-link" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-teal-500 font-heading text-sm font-black text-zinc-950">
              V
            </span>
            <span className="text-xl font-bold tracking-tight">Vektor</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              data-testid="about-login-link"
              className="px-3 py-2 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
            >
              Sign in
            </Link>
            <Link to="/signup" search={{ ref: undefined }} data-testid="about-signup-link">
              <Button size="sm" className="bg-zinc-900 text-white hover:bg-zinc-800">
                Create free account
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-4xl px-6 py-20 lg:py-28">
            <p className="mb-4 text-[11px] font-bold tracking-[0.25em] text-teal-400 uppercase">
              About Vektor
            </p>
            <h1 className="text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Why We Built <span className="text-teal-400">Vektor</span>
            </h1>
            <p className="mt-8 max-w-3xl text-lg leading-relaxed text-zinc-300">
              Winning a government tender in South Africa shouldn&rsquo;t feel like navigating a
              minefield of expired documents, mismatched forms, and last-minute compliance panic.
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-zinc-300">
              Yet that&rsquo;s exactly what most SMMEs experience. They lose tenders not because
              they&rsquo;re incapable — but because of technicalities. An outdated{" "}
              <strong className="text-white">B-BBEE affidavit</strong>. A missing signature on an{" "}
              <strong className="text-white">SBD form</strong>. A{" "}
              <strong className="text-white">CSD status</strong> that slipped. A{" "}
              <strong className="text-white">Tax Compliance PIN</strong> that expired three days
              before closing.
            </p>
            <p className="mt-4 max-w-3xl text-lg font-semibold leading-relaxed text-white">
              We built Vektor because we believe South African businesses deserve better.
            </p>
          </div>
        </section>

        {/* The problem */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 px-6 py-16 md:grid-cols-3 lg:py-20">
            <div className="md:col-span-1">
              <p className="text-[11px] font-bold tracking-[0.25em] text-zinc-500 uppercase">
                The problem
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                Capable companies, disqualified on technicalities.
              </h2>
            </div>
            <div className="space-y-4 leading-relaxed text-zinc-700 md:col-span-2">
              <p>
                Every year, thousands of capable companies get disqualified before their price or
                capability is even considered. The process is complex, the rules keep changing, and
                the cost of one small mistake is high.
              </p>
              <p className="font-semibold text-zinc-900">Vektor exists to remove that friction.</p>
            </div>
          </div>
        </section>

        {/* How we help */}
        <section className="border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold tracking-[0.25em] text-teal-700 uppercase">
                How we help
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                We act as your Compliance Guide.
              </h2>
              <p className="mt-3 text-zinc-600">
                Vektor turns the four highest-cost pain points in SA tender compliance into a live,
                proactive dashboard.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {HOW_WE_HELP.map((item) => (
                <div
                  key={item.title}
                  data-testid={item.testId}
                  className="flex gap-4 rounded-sm border border-zinc-200 bg-white p-6"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-teal-200 bg-teal-50 text-teal-700">
                    <span aria-hidden>✓</span>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">{item.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who we serve */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 px-6 py-16 md:grid-cols-3 lg:py-20">
            <div className="md:col-span-1">
              <p className="text-[11px] font-bold tracking-[0.25em] text-zinc-500 uppercase">
                Who we serve
              </p>
              <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-100 text-zinc-700">
                <HandshakeIcon aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-4 leading-relaxed text-zinc-700 md:col-span-2">
              <p className="text-2xl font-bold leading-tight tracking-tight text-zinc-900">
                We built Vektor for the serious South African business.
              </p>
              <p>
                The contractor, consultant, supplier, and service provider who wants to compete
                fairly and win more work from government.
              </p>
            </div>
          </div>
        </section>

        {/* Bargaining council guidance */}
        <section
          className="border-b border-zinc-200 bg-zinc-50"
          data-testid="about-bargaining-section"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <p className="text-[11px] font-bold tracking-[0.25em] text-teal-700 uppercase">
              Compliance context
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Know your Bargaining Council before you bid.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600">
              Every SA construction tender falls under a sectoral bargaining council. You must be
              registered and hold a current Letter of Good Standing or you risk disqualification
              even when every other document is perfect.
            </p>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full border border-zinc-200 bg-white text-sm">
                <thead className="bg-zinc-50 text-xs tracking-[0.1em] text-zinc-600 uppercase">
                  <tr>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">CIDB Class</th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">
                      Applicable Council
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2 text-left">Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="px-3 py-2 font-mono">CE</td>
                    <td className="px-3 py-2">
                      <a
                        href="https://www.bccei.co.za"
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 underline"
                      >
                        BCCEI — Civil Engineering
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">National</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">EB / EP</td>
                    <td className="px-3 py-2">
                      <a
                        href="https://www.nbcei.co.za"
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 underline"
                      >
                        NBCEI — Electrical
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">National</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">ME</td>
                    <td className="px-3 py-2">
                      <a
                        href="https://www.meibc.co.za"
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 underline"
                      >
                        MEIBC — Mechanical / HVAC
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">National</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">GB</td>
                    <td className="px-3 py-2">
                      5 regional BIBCs (Cape, Southern/Eastern Cape, East London, Kimberley,
                      Bloemfontein)
                    </td>
                    <td className="px-3 py-2 text-zinc-600">Regional — by province</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-zinc-600">
              Manage your Letters of Good Standing in the{" "}
              <Link
                to="/documents"
                data-testid="about-vault-link"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                Document Vault
              </Link>{" "}
              and learn more in{" "}
              <Link
                to="/help"
                data-testid="about-help-link"
                className="font-semibold text-zinc-900 underline underline-offset-2"
              >
                Help &amp; Guides
              </Link>
              .
            </p>
            <div className="mt-6 rounded-sm border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-bold tracking-tight">Official verification portals</h3>
              <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
                <li>
                  <a
                    href="https://esearch.cipc.co.za/"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="about-cipc-link"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    CIPC eSearch — verify company registration ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://secure.csd.gov.za/"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="about-csd-link"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    National Treasury CSD (MAAA) portal ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://tools.sars.gov.za/tcc/"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="about-sars-link"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    SARS Tax Compliance Status portal ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://registers.cidb.org.za/"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="about-cidb-link"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    CIDB Registers of Contractors — verify grade &amp; class ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.bccei.co.za"
                    target="_blank"
                    rel="noreferrer"
                    data-testid="about-bccei-link"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    BCCEI — Civil Engineering ↗
                  </a>
                  {" · "}
                  <a
                    href="https://www.nbcei.co.za"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    NBCEI ↗
                  </a>
                  {" · "}
                  <a
                    href="https://www.meibc.co.za"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-zinc-900 underline underline-offset-2"
                  >
                    MEIBC ↗
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Our promise */}
        <section className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold tracking-[0.25em] text-teal-400 uppercase">
                Our promise
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything a South African contractor needs to bid with confidence.
              </h2>
            </div>

            <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
              {PROMISE.map((p) => (
                <div
                  key={p.label}
                  data-testid={p.testId}
                  className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-6 text-center"
                >
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-sm border border-teal-500/40 bg-teal-500/15 text-teal-400">
                    <span aria-hidden>●</span>
                  </div>
                  <p className="mt-4 font-semibold text-white">{p.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center lg:py-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to stop losing tenders on technicalities?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-600">
              Start with 1 free tender analysis on signup. No card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" search={{ ref: undefined }} data-testid="about-cta-signup">
                <Button
                  size="lg"
                  className="w-full bg-zinc-900 text-white hover:bg-zinc-800 sm:w-auto"
                >
                  Create free account{" "}
                  <span aria-hidden className="ml-2">
                    →
                  </span>
                </Button>
              </Link>
              <Link to="/login" data-testid="about-cta-login">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-zinc-300 text-zinc-900 hover:bg-zinc-100 sm:w-auto"
                >
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.15em] text-zinc-500 uppercase">
              <SearchIcon aria-hidden="true" /> Built for South African contractors
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-zinc-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-zinc-500 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-teal-600 text-[10px] font-black text-white">
              V
            </span>
            <span>© {new Date().getFullYear()} Vektor · SA Tender Compliance</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/about" className="hover:text-zinc-900">
              About
            </Link>
            <Link to="/help" className="hover:text-zinc-900">
              Help
            </Link>
            <Link to="/terms" className="hover:text-zinc-900">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-zinc-900">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
