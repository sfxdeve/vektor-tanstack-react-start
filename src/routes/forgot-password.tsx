import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), redirectTo: "/reset-password" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || "Could not send reset link");
      }
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send reset link. Try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/login"
            data-testid="link-back-to-login"
            className="font-semibold text-teal-400 underline underline-offset-2 transition-colors hover:text-teal-300"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div
          data-testid="forgot-sent-state"
          className="rounded-sm border border-teal-500/30 bg-teal-500/10 p-5"
        >
          <div className="flex items-start gap-3">
            <span className="text-teal-400">✓</span>
            <div>
              <p className="text-sm font-semibold text-white">Check your inbox</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                If <span className="font-mono text-white">{email}</span> is registered with Vektor,
                a password-reset link is on its way. The link expires in{" "}
                <strong className="text-white">1 hour</strong> and can only be used once.
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Didn&apos;t get anything? Check your spam folder, email us at{" "}
                <a
                  href="mailto:support@vektorhq.co.za"
                  data-testid="forgot-support-email"
                  className="font-semibold text-teal-400 underline underline-offset-2 hover:text-teal-300"
                >
                  support@vektorhq.co.za
                </a>
                , or{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  data-testid="forgot-try-again-btn"
                  className="font-semibold text-teal-400 underline underline-offset-2 hover:text-teal-300"
                >
                  try a different email
                </button>
                .
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-form">
          <div>
            <Label
              htmlFor="email"
              className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
            >
              Email
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
          <Button
            type="submit"
            data-testid="submit-forgot"
            disabled={submitting}
            size="lg"
            className="w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
          >
            {submitting ? "Sending link…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
