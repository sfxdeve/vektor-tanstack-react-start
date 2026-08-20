import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { authClient } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
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
    if (role !== "admin" || impersonatedBy) {
      void navigate({ to: "/app" });
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
    <div className="min-h-screen bg-zinc-900 text-white">
      <ImpersonationBanner />
      <header data-testid="admin-nav" className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-teal-500 font-heading text-sm font-black text-zinc-950">
              V
            </span>
            <span className="text-xl font-bold tracking-tight">Vektor Admin</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/admin" data-testid="admin-nav-overview" className="font-semibold text-white">
              Overview
            </a>
            <a
              href="/admin/users"
              data-testid="admin-nav-users"
              className="text-zinc-400 hover:text-white"
            >
              Users
            </a>
            <a
              href="/admin/companies"
              data-testid="admin-nav-companies"
              className="text-zinc-400 hover:text-white"
            >
              Companies
            </a>
            <a
              href="/admin/eft"
              data-testid="admin-nav-eft"
              className="text-zinc-400 hover:text-white"
            >
              EFT
            </a>
          </nav>
        </div>
      </header>
      <main className="p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="admin-overview-title">
          Admin Console
        </h1>
        <p className="mt-2 text-sm text-zinc-400">Centralised operations overview.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            data-testid="admin-stat-users"
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
          >
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">Users</p>
            <p className="mt-2 text-2xl font-bold">—</p>
          </div>
          <div
            data-testid="admin-stat-companies"
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
          >
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              Companies
            </p>
            <p className="mt-2 text-2xl font-bold">—</p>
          </div>
          <div
            data-testid="admin-stat-eft"
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-6"
          >
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              EFT Payments
            </p>
            <p className="mt-2 text-2xl font-bold">—</p>
          </div>
        </div>
      </main>
    </div>
  );
}
