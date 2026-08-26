import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { VektorMark } from "@/components/vektor-mark";

/** Dark-auth field chrome. Placeholder + autofill stay WCAG AA on zinc-950. */
export const AUTH_INPUT_CLASS =
  "rounded-sm border-zinc-800 !bg-zinc-950 text-white placeholder:!text-zinc-300 focus-visible:border-teal-500 focus-visible:ring-teal-500/20 dark:!bg-zinc-950 [&:-webkit-autofill]:[-webkit-text-fill-color:#fafafa] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#09090b]";

export function AuthShell({
  title,
  subtitle,
  eyebrow,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-zinc-900 p-12 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 90%, rgba(45,212,191,0.14) 0%, transparent 50%)",
          }}
        />
        <Link to="/" data-testid="auth-brand-home" className="relative flex items-center gap-2.5">
          <VektorMark className="h-8 w-8 text-lg" />
          <span className="text-2xl font-bold tracking-tight">Vektor</span>
        </Link>

        <div className="relative max-w-md space-y-6">
          <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-teal-400 uppercase">
            <span className="inline-block h-px w-6 bg-teal-400" />
            SA Tender Compliance
          </p>
          <h2 className="text-4xl leading-[1.05] font-black tracking-tight xl:text-5xl">
            Never lose a bid on a<span className="text-teal-400"> technicality</span> again.
          </h2>
          <p className="text-sm leading-relaxed text-zinc-400">
            CIDB matching, B-BBEE scoring, and expiry alerts for SA public tenders in seconds, not
            weeks.
          </p>
          <ul className="space-y-2.5 pt-2 text-sm text-zinc-300">
            <li className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 rounded-full bg-teal-500" />
              <span>1 free tender analysis on signup</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 rounded-full bg-teal-500" />
              <span>Auto-fill SBD 4 and SBD 6.1 forms</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 rounded-full bg-teal-500" />
              <span>Email alerts 30 / 7 / 0 days before compliance expires</span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-zinc-400">
          © {new Date().getFullYear()} Vektor · Built for South African contractors ·{" "}
          <Link
            to="/about"
            data-testid="auth-about-link"
            className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-teal-400"
          >
            About Vektor
          </Link>
        </p>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-6 py-12">
        <div className="relative w-full max-w-sm">
          <div className="mt-2 mb-10 flex items-center justify-center gap-3 lg:hidden">
            <VektorMark className="h-10 w-10 text-xl" />
            <span className="text-3xl font-bold tracking-tight">Vektor</span>
          </div>
          {eyebrow && (
            <p
              data-testid="auth-eyebrow"
              className="mb-6 border-b border-zinc-800 pb-6 text-sm leading-relaxed text-zinc-400"
            >
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-zinc-400">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
