import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Sidebar } from "@/components/sidebar";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      void navigate({ to: "/login" });
      return;
    }
    const role = (session.user as unknown as { role?: string }).role;
    const impersonatedBy = (session.session as unknown as { impersonatedBy?: string })
      ?.impersonatedBy;
    if (role === "admin" && !impersonatedBy) {
      void navigate({ to: "/admin" });
    }
  }, [session, isPending, navigate]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="text-sm font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          Loading…
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:h-screen">
      <ImpersonationBanner />
      <Sidebar />
      <div className="flex-1 overflow-auto bg-zinc-50">
        <div className="border-b border-zinc-200 bg-white px-4 py-6 sm:px-8">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="dashboard-title">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-600">Your compliance overview.</p>
        </div>
        <div className="p-4 sm:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div
              data-testid="dashboard-card-compliance"
              className="rounded-sm border border-zinc-200 bg-white p-6"
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Compliance
              </p>
              <p className="mt-2 text-2xl font-bold">Healthy</p>
            </div>
            <div
              data-testid="dashboard-card-cidb"
              className="rounded-sm border border-zinc-200 bg-white p-6"
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">CIDB</p>
              <p className="mt-2 text-sm text-zinc-600">Add your grades in Company Setup</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
