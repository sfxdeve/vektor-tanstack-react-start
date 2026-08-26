import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AUTH_INPUT_CLASS, AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordStrength } from "@/components/password-strength";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string | undefined) ?? undefined,
    error: (search.error as string | undefined) ?? undefined,
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const token = (search as { token?: string }).token ?? "";
  const errorParam = (search as { error?: string }).error;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters");
      return;
    }
    if (!token) {
      toast.error("Missing reset token — request a new link.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        toast.error(error.message || "Reset failed — link may have expired.");
        setSubmitting(false);
        return;
      }
    } catch {
      toast.error("Reset failed — link may have expired.");
      setSubmitting(false);
      return;
    }
    toast.success("Password updated — you can now sign in.");
    await navigate({ to: "/login", search: {}, replace: true });
  };

  if (errorParam) {
    return (
      <AuthShell
        title="Reset link invalid"
        subtitle="This link is no longer valid. Please request a new one."
      >
        <p className="text-sm text-zinc-400">Error: {errorParam}</p>
        <Link
          to="/forgot-password"
          data-testid="link-forgot-again"
          className="mt-4 inline-block font-semibold text-teal-400 underline underline-offset-2"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="Missing token. Check your email for the full link."
      >
        <Link
          to="/forgot-password"
          data-testid="link-forgot-again"
          className="font-semibold text-teal-400 underline underline-offset-2"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Pick a new password"
      subtitle="At least 10 characters. A passphrase is strongest."
    >
      <form onSubmit={onSubmit} className="space-y-4" data-testid="reset-form">
        <FieldGroup>
          <Field>
            <FieldLabel
              htmlFor="password"
              className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
            >
              New password
            </FieldLabel>
            <Input
              id="password"
              data-testid="input-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={AUTH_INPUT_CLASS}
            />
            <PasswordStrength password={password} />
          </Field>
          <Field>
            <FieldLabel
              htmlFor="confirm"
              className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
            >
              Confirm password
            </FieldLabel>
            <Input
              id="confirm"
              data-testid="input-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={AUTH_INPUT_CLASS}
            />
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          data-testid="submit-reset"
          disabled={submitting}
          size="lg"
          className="w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
        >
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
