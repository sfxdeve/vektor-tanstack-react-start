import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { VektorMark } from "@/components/vektor-mark";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", testId: "admin-nav-overview" },
  { to: "/admin/users", label: "Users", testId: "admin-nav-users" },
  { to: "/admin/companies", label: "Companies", testId: "admin-nav-companies" },
  { to: "/admin/eft", label: "EFT", testId: "admin-nav-eft" },
  { to: "/help", label: "Help", testId: "admin-nav-help" },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: rawData } = authClient.useSession();
  const user = asVektorSession(rawData)?.user;

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <ImpersonationBanner />
      <header data-testid="admin-nav" className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <VektorMark />
            <span className="text-xl font-bold tracking-tight">Vektor Admin</span>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:gap-x-6">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.testId}
                    to={item.to}
                    data-testid={item.testId}
                    className={
                      active ? "font-semibold text-white" : "text-zinc-400 hover:text-white"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <button
                type="button"
                data-testid="admin-btn-signout"
                aria-label="Sign out"
                title={`Sign out ${user.email}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                onClick={async () => {
                  await authClient.signOut();
                  toast.success("Signed out");
                  await navigate({ to: "/login", search: {} });
                }}
              >
                <LogOutIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="p-6 sm:p-8">{children}</main>
    </div>
  );
}
