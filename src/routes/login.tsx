import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await authClient.signIn.email(
        { email: email.trim(), password },
        {
          onError: (ctx) => {
            toast.error(ctx.error.message || "Login failed");
            throw new Error(ctx.error.message);
          },
        },
      );
      // better-auth client may return data with requirePasswordChange via our old logic; handle generically
      const data = res?.data as unknown as
        | { requirePasswordChange?: boolean; resetToken?: string; reason?: string }
        | undefined;
      if (data?.requirePasswordChange) {
        toast.info("An admin reset your password — pick a new one to continue.");
        await navigate({
          to: "/reset-password",
          search: { token: data.resetToken ?? "", reason: data.reason } as never,
        });
        return;
      }
      toast.success("Welcome back");
      // role-based redirect: fetch session to check role
      const session = await authClient.getSession();
      const role = (session?.data?.user as unknown as { role?: string })?.role;
      if (role === "admin") {
        await navigate({ to: "/admin" });
      } else {
        await navigate({ to: "/app" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (!msg.includes("Invalid") && !msg.includes("failed")) {
        // already toasted in onError
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to Vektor."
      eyebrow="Catch expired documents and missed forms before they cost you a bid."
    >
      <Link to="/signup" search={{ ref: undefined }} data-testid="link-signup" className="block">
        <Button
          type="button"
          data-testid="cta-create-account"
          size="lg"
          className="w-full bg-teal-500 font-bold text-zinc-950 hover:bg-teal-400"
        >
          Create free account
          <span className="ml-2">→</span>
        </Button>
      </Link>
      <p className="mt-3 text-[11px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
        1 tender analysis free · no card required
      </p>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Or sign in
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="my-4 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Or with email
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
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
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-xs font-semibold tracking-[0.1em] text-zinc-300 uppercase"
            >
              Password
            </Label>
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
            className="mt-2 rounded-sm border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            placeholder="••••••••"
          />
        </div>
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
