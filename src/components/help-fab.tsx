import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRightIcon, CircleQuestionMarkIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Floating "?" button with context-aware tips + a link into the full Help
 * page. Hidden on auth pages and the admin console (which has its own
 * shortcuts) — mirrors the old HelpFab placement rules.
 */
const PAGE_TIPS: Record<string, { title: string; tips: string[] }> = {
  "/app": {
    title: "Dashboard tips",
    tips: [
      "Your credit balance and active company are shown in the sidebar.",
      "Recent tender analyses appear here — each row shows its Fit Score.",
      "Start a new analysis from the Analyze Tender tab.",
    ],
  },
  "/setup": {
    title: "Setting up your company",
    tips: [
      "CIPC format: YYYY/NNNNNN/TT — we auto-derive your incorporation year.",
      "SARS TCS PIN: 9–10 alphanumeric chars. Case is normalised automatically.",
      "CSD MAAA: 'MAAA' + 7 digits (case-insensitive).",
      "Each field links to its official verification portal.",
    ],
  },
  "/documents": {
    title: "Managing your vault",
    tips: [
      "Upload PDFs, JPGs or PNGs of your compliance documents.",
      "Set the expiry date — anything within 30 days shows amber.",
      "Compliance status feeds the disqualification risk flags in tender analysis.",
    ],
  },
  "/analyze": {
    title: "Running an analysis",
    tips: [
      "One tender analysis = 1 credit (refunded if extraction fails).",
      "Only PDF files are accepted. The first 10 pages are analysed.",
      "Choose 80/20 (< R50m) or 90/10 (> R50m) preference-point system.",
    ],
  },
  "/billing": {
    title: "Credits & subscriptions",
    tips: [
      "New companies get 1 free analysis credit on signup.",
      "Pay by EFT — credits are added once an admin verifies your deposit.",
      "Subscribers keep unused credits, up to 2× their monthly allowance.",
    ],
  },
  "/help": {
    title: "You're already in Help",
    tips: [
      "The illustrated walkthrough covers every key screen.",
      "Jump between chapters with the chapter cards.",
      "Scroll down for the full feature reference and council mapping.",
    ],
  },
};

const DEFAULT_TIPS = {
  title: "Need a hand?",
  tips: [
    "Open the full guide for the walkthrough and feature reference.",
    "Every field in the app has an official-portal deep-link where relevant.",
  ],
};

const HIDDEN_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password", "/admin"];
const HIDDEN_EXACT = ["/", "/about", "/terms", "/privacy"];

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (HIDDEN_EXACT.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const key = Object.keys(PAGE_TIPS).find((p) => pathname.startsWith(p));
  const ctx = key ? PAGE_TIPS[key]! : DEFAULT_TIPS;

  return (
    <>
      <button
        type="button"
        data-testid="help-fab"
        onClick={() => setOpen(true)}
        aria-label="Open help drawer"
        className="fixed right-6 bottom-6 z-40 flex h-12 w-12 items-center justify-center rounded-sm bg-teal-700 text-white shadow-lg transition-colors hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <CircleQuestionMarkIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-md gap-0 p-0 sm:max-w-md"
          data-testid="help-drawer"
        >
          <SheetHeader className="border-b border-zinc-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="overline mb-1 text-zinc-500">Contextual help</p>
                <SheetTitle className="text-lg font-bold" data-testid="help-drawer-title">
                  {ctx.title}
                </SheetTitle>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="help-drawer-close"
                aria-label="Close help"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm hover:bg-zinc-100"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <SheetDescription className="sr-only">
              Context-aware tips for this page.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-6">
            <ul className="space-y-3">
              {ctx.tips.map((t, i) => (
                <li
                  key={t}
                  data-testid={`help-drawer-tip-${i}`}
                  className="flex gap-3 text-sm leading-relaxed text-zinc-700"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-teal-700 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-zinc-200 bg-zinc-50 p-6">
            {pathname !== "/help" ? (
              <Button
                type="button"
                data-testid="help-drawer-open-full-guide"
                onClick={() => {
                  setOpen(false);
                  void navigate({ to: "/help" });
                }}
                className="w-full bg-zinc-900 px-4 py-3 font-semibold text-white hover:bg-zinc-700"
              >
                Open the full guide &amp; walkthrough
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                render={<Link to="/app" />}
                data-testid="help-drawer-back-dashboard"
                variant="outline"
                className="w-full border-zinc-900"
              >
                Back to dashboard
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
