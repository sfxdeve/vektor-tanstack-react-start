// oxlint-disable react/set-state-in-effect
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth/auth-client";
import { getUserRole, isImpersonating } from "@/lib/admin";

export function useAdminGuard() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      void navigate({ to: "/login" });
      return;
    }
    const role = getUserRole(session as unknown as Parameters<typeof getUserRole>[0]);
    const impersonated = isImpersonating(session as unknown as Parameters<typeof isImpersonating>[0]);
    if (role !== "admin" || impersonated) {
      void navigate({ to: "/app" });
    }
  }, [session, isPending, navigate]);

  return { session, isPending };
}
