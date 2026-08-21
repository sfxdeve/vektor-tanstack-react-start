// oxlint-disable react/set-state-in-effect
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { asVektorSession, authClient } from "@/lib/auth/auth-client";

/**
 * Guard for protected user pages. Behavior mirrors the old ProtectedRoute:
 *   - unauthenticated → /login
 *   - admin not currently impersonating → /admin (admins live in the console)
 */
export function useRequireUser() {
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
    if (isAdmin && !impersonated) {
      void navigate({ to: "/admin" });
    }
  }, [isPending, userId, isAdmin, impersonated, navigate]);

  return { session, isPending };
}
