import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  validateSearch: (search: Record<string, unknown>) => ({
    ref: (search.ref as string | undefined) ?? undefined,
  }),
});

function isPasswordAcceptable(password: string, email?: string) {
  if (password.length < 10) return false;
  if (email && password.toLowerCase() === email.toLowerCase()) return false;
  return true;
}

function SignupPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const refCode = (search as { ref?: string }).ref ?? null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refPreview, setRefPreview] = useState<{
    referrer_first_name: string;
    referrer_company?: string;
  } | null>(null);

  useEffect(() => {
    if (!refCode) return;
    // Attempt lookup but never block signup if it fails or code is invalid
    fetch(`/api/referrals/lookup?code=${encodeURIComponent(refCode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const d = data as { referrer_first_name?: string } | null;
        if (d?.referrer_first_name)
          setRefPreview(d as { referrer_first_name: string; referrer_company?: string });
      })
      .catch(() => setRefPreview(null));
  }, [refCode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordAcceptable(password, email)) {
      toast.error("Please pick a stronger password (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    try {
      // Store ref code in localStorage for later referral slice to pick up if backend doesn't handle it directly
      if (refCode) {
        try {
          localStorage.setItem("vektor_ref_code", refCode);
        } catch {}
      }
      await authClient.signUp.email(
        { email: email.trim(), password, name: name.trim() || (email.split("@")[0] ?? email) },
        {
          onError: (ctx) => {
            toast.error(ctx.error.message || "Signup failed");
            throw new Error(ctx.error.message);
          },
        },
      );
      // Attribution: if signup carried ?ref=, link invitee -> referrer (first-code-wins, self-blocked)
      if (refCode) {
        try {
          await fetch("/api/referrals/claim", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: refCode }),
          });
        } catch {
          // non-blocking — referral attribution is best-effort
        }
      }
      toast.success("Account created — welcome to Vektor");
      await navigate({ to: "/app" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      // already toasted
      if (msg && !msg.includes("already")) {
        // ensure toast
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with 1 free tender analysis. No credit card."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            data-testid="link-login"
            className="font-semibold text-teal-400 underline underline-offset-2 transition-colors hover:text-teal-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      {refPreview && (
        <div
          data-testid="signup-referral-banner"
          className="mb-6 flex items-start gap-3 rounded-sm border border-teal-500/40 bg-teal-500/10 p-4"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-teal-500/40 bg-teal-500/20">
            <span className="text-teal-300">🎁</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs font-bold tracking-[0.15em] text-teal-300 uppercase">
              You&apos;ve been invited
            </p>
            <p className="text-sm leading-snug text-white">
              <span className="font-bold">{refPreview.referrer_first_name}</span>
              {refPreview.referrer_company && (
                <span className="text-zinc-400"> at {refPreview.referrer_company}</span>
              )}{" "}
              invited you to try Vektor. Get{" "}
              <strong className="text-teal-300">1 free tender analysis</strong> to see how it works
              — no credit card required.
            </p>
          </div>
        </div>
      )}
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Or with email
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
        <div>
          <Label
            htmlFor="name"
            className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
          >
            Your name
          </Label>
          <Input
            id="name"
            data-testid="input-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 rounded-sm border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            placeholder="Rafeeq Fredericks"
          />
        </div>
        <div>
          <Label
            htmlFor="email"
            className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
          >
            Work email
          </Label>
          <Input
            id="email"
            data-testid="input-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-2 rounded-sm border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            placeholder="you@company.co.za"
          />
        </div>
        <div>
          <Label
            htmlFor="password"
            className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
          >
            Password
          </Label>
          <Input
            id="password"
            data-testid="input-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-2 rounded-sm border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            placeholder="A memorable phrase works best"
          />
          <p className="mt-1 text-xs text-zinc-500">
            At least 10 characters. A 4-word phrase beats a short scrambled password.
          </p>
        </div>
        <Button
          type="submit"
          data-testid="submit-signup"
          disabled={submitting}
          size="lg"
          className="w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
        >
          {submitting ? "Creating account…" : "Create account & start free"}
          {!submitting && <span className="ml-2">→</span>}
        </Button>
      </form>
    </AuthShell>
  );
}
