// oxlint-disable react/set-state-in-effect
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { asVektorSession, authClient } from "@/lib/auth/auth-client";

/** True when an admin is currently wearing a user hat (impersonation active). */
export function useImpersonationState() {
  const { data: session } = authClient.useSession();
  return {
    impersonatedBy: session?.session.impersonatedBy ?? null,
    role: session?.user.role ?? null,
  };
}

/**
 * Guard for /admin/* pages. Behavior mirrors the old AdminRoute:
 *   - unauthenticated → /login
 *   - authenticated non-admin (or an impersonating admin) → /app
 */
export function useAdminGuard() {
  const navigate = useNavigate();
  const { data, isPending } = authClient.useSession();
  const session = asVektorSession(data);
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";
  const impersonated = Boolean(session?.session?.impersonatedBy);

  useEffect(() => {
    // Depend on primitives — the session object identity churns on every
    // better-auth poll, which would otherwise re-trigger navigations.
    if (isPending) return;
    if (!userId) {
      void navigate({ to: "/login" });
      return;
    }
    if (!isAdmin || impersonated) {
      void navigate({ to: "/app" });
    }
  }, [isPending, userId, isAdmin, impersonated, navigate]);

  return { session, isPending };
}
