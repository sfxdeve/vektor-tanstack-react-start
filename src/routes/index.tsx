import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      const role = (session.user as unknown as { role?: string }).role;
      const impersonatedBy = (session.session as unknown as { impersonatedBy?: string })
        ?.impersonatedBy;
      if (role === "admin" && !impersonatedBy) {
        navigate({ to: "/admin" });
      } else {
        navigate({ to: "/app" });
      }
    }
  }, [session, isPending, navigate]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header
        data-testid="landing-nav"
        className="fixed inset-x-0 top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link to="/" data-testid="landing-logo" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-teal-500 font-heading text-sm font-black text-zinc-950">
              V
            </span>
            <span className="text-xl font-bold tracking-tight">Vektor</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
            <Link to="/about" className="transition-colors hover:text-white">
              About
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              data-testid="landing-signin"
              className="text-sm font-semibold text-zinc-300 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              search={{ ref: undefined }}
              data-testid="landing-cta-nav"
              className="inline-flex items-center gap-1.5 rounded-sm bg-teal-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-teal-400"
            >
              Start free →
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-36 pb-24 lg:pt-44 lg:pb-32" data-testid="landing-hero">
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
                <strong className="text-white">B-BBEE points</strong>, and flags every missing SBD
                form before you submit.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  to="/signup"
                  search={{ ref: undefined }}
                  data-testid="landing-hero-cta"
                  className="group inline-flex items-center gap-2 rounded-sm bg-teal-500 px-6 py-3.5 text-base font-bold text-zinc-950 shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-400"
                >
                  Start with 1 free analysis <span>→</span>
                </Link>
                <Link
                  to="/about"
                  data-testid="landing-hero-secondary-cta"
                  className="inline-flex items-center gap-2 text-base font-semibold text-zinc-300 transition-colors hover:text-white"
                >
                  How Vektor works ↗
                </Link>
              </div>
            </div>
            <div
              data-testid="landing-hero-visual"
              className="relative rounded-md border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-zinc-400 uppercase">Go / No-Go</p>
                  <p className="mt-0.5 text-2xl font-bold text-teal-400">GO — 84%</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] tracking-[0.2em] text-zinc-400 uppercase">
                    B-BBEE Points
                  </p>
                  <p className="mt-0.5 text-2xl font-bold text-white">22 / 25</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-y border-zinc-900 bg-zinc-950 py-14"
          data-testid="landing-social-proof"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <p className="mb-8 text-center text-[10px] font-semibold tracking-[0.25em] text-zinc-400 uppercase">
              Trusted by contractors from Cape Town to Polokwane
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 text-center md:grid-cols-4">
              <div>
                <p className="text-3xl font-black tracking-tight text-white lg:text-4xl">15s</p>
                <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                  Average analysis time
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tracking-tight text-white lg:text-4xl">R4.2M</p>
                <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                  Avg tender value screened
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tracking-tight text-white lg:text-4xl">98%</p>
                <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                  Correct SBD form matches
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tracking-tight text-white lg:text-4xl">0</p>
                <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                  Missed compliance items
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16" data-testid="landing-pricing">
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <h2 className="text-3xl font-bold tracking-tight">Pricing in ZAR — pay by EFT</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Transparent monthly and pay-as-you-go options. No card fees.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div
                data-testid="pricing-card-starter"
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-6"
              >
                <p className="text-sm font-bold">Starter</p>
                <p className="mt-2 text-2xl font-black">R399</p>
                <p className="text-xs text-zinc-400">5 credits / month</p>
                <Button
                  data-testid="pricing-cta-starter"
                  className="mt-4 w-full bg-zinc-800 text-white hover:bg-zinc-700"
                >
                  Choose Starter
                </Button>
              </div>
              <div
                data-testid="pricing-card-pro"
                className="rounded-sm border border-teal-500 bg-zinc-900 p-6"
              >
                <p className="inline-block rounded-sm bg-teal-500 px-2 py-0.5 text-[10px] font-bold tracking-[0.15em] text-zinc-950 uppercase">
                  Popular
                </p>
                <p className="mt-2 text-sm font-bold">Pro</p>
                <p className="mt-2 text-2xl font-black">R1299</p>
                <p className="text-xs text-zinc-400">20 credits / month</p>
                <Button
                  data-testid="pricing-cta-pro"
                  className="mt-4 w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
                >
                  Choose Pro
                </Button>
              </div>
              <div
                data-testid="pricing-card-scale"
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-6"
              >
                <p className="text-sm font-bold">Scale</p>
                <p className="mt-2 text-2xl font-black">R2499</p>
                <p className="text-xs text-zinc-400">50 credits / month</p>
                <Button
                  data-testid="pricing-cta-scale"
                  className="mt-4 w-full bg-zinc-800 text-white hover:bg-zinc-700"
                >
                  Choose Scale
                </Button>
              </div>
              <div
                data-testid="pricing-card-payg"
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-6"
              >
                <p className="text-sm font-bold">Single Analysis</p>
                <p className="mt-2 text-2xl font-black">R149</p>
                <p className="text-xs text-zinc-400">1 credit — pay as you go</p>
                <Button
                  data-testid="pricing-cta-payg"
                  className="mt-4 w-full bg-zinc-800 text-white hover:bg-zinc-700"
                >
                  Buy PAYG
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 px-6 py-8 text-center text-xs text-zinc-400 lg:px-10">
        © {new Date().getFullYear()} Vektor ·{" "}
        <Link to="/about" className="underline underline-offset-2 hover:text-teal-400">
          About
        </Link>{" "}
        ·{" "}
        <Link to="/terms" className="underline underline-offset-2 hover:text-teal-400">
          Terms
        </Link>{" "}
        ·{" "}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-teal-400">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
