import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AUTH_INPUT_CLASS, AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";

const USER_DESTINATIONS = [
  "/app",
  "/setup",
  "/documents",
  "/analyze",
  "/billing",
  "/help",
] as const;
type UserDestination = (typeof USER_DESTINATIONS)[number];

function userDestination(value: unknown): UserDestination | null {
  return typeof value === "string" && USER_DESTINATIONS.some((path) => path === value)
    ? (value as UserDestination)
    : null;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: UserDestination } => {
    const redirect = userDestination(search.redirect);
    return redirect ? { redirect } : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await authClient.signIn.email({ email: email.trim(), password });
    if (error) {
      toast.error(error.message || "Login failed");
      setSubmitting(false);
      return;
    }
    toast.success("Welcome back");
    // Role-based redirect: admins live in the console.
    const { data } = await authClient.getSession();
    if (asVektorSession(data)?.user?.role === "admin") {
      await navigate({ to: "/admin" });
    } else {
      await navigate({ to: search.redirect ?? "/app" });
    }
    setSubmitting(false);
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to Vektor."
      eyebrow="Catch expired documents and missed forms before they cost you a bid."
    >
      <Button
        render={<Link to="/signup" search={{ ref: undefined }} data-testid="link-signup" />}
        data-testid="cta-create-account"
        size="lg"
        className="w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
      >
        Create free account
        <span className="ml-2">→</span>
      </Button>
      <p className="mt-3 text-[11px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
        1 tender analysis free · no card required
      </p>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Or with email
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
        <FieldGroup>
          <Field>
            <FieldLabel
              htmlFor="email"
              className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
            >
              Email
            </FieldLabel>
            <Input
              id="email"
              data-testid="input-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={AUTH_INPUT_CLASS}
              placeholder="you@company.co.za"
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel
                htmlFor="password"
                className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
              >
                Password
              </FieldLabel>
              <Link
                to="/forgot-password"
                data-testid="link-forgot-password"
                className="text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-teal-400"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              data-testid="input-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={AUTH_INPUT_CLASS}
              placeholder="••••••••"
            />
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          data-testid="submit-login"
          disabled={submitting}
          size="lg"
          variant="outline"
          className="w-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
