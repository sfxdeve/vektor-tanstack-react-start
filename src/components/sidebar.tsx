import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/auth-client";

const navItems = [
  { to: "/app", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/analyze", label: "Analyze Tender", testId: "nav-analyze" },
  { to: "/documents", label: "Document Vault", testId: "nav-documents" },
  { to: "/setup", label: "Company Setup", testId: "nav-setup" },
  { to: "/billing", label: "Billing & Credits", testId: "nav-billing" },
  { to: "/help", label: "Help & Guides", testId: "nav-help" },
  { to: "/about", label: "About Vektor", testId: "nav-about" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [mobileOpen, setMobileOpen] = useState(false);

  const isImpersonating = Boolean(
    (session?.session as unknown as { impersonatedBy?: string })?.impersonatedBy,
  );
  const mobileTopbarTopClass = isImpersonating ? "top-[38px]" : "top-0";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [mobileOpen]);

  return (
    <>
      <div
        data-testid="mobile-topbar"
        className={`fixed inset-x-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 text-white lg:hidden ${mobileTopbarTopClass}`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          data-testid="mobile-menu-open"
          aria-label="Open navigation"
          className="flex h-10 w-10 -ml-2 items-center justify-center rounded-sm hover:bg-zinc-800"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-teal-500 font-heading text-xs font-black text-zinc-950">
            V
          </span>
          <span className="text-lg font-bold tracking-tight">Vektor</span>
        </div>
        <div className="h-10 w-10" aria-hidden="true" />
      </div>
      <div className="h-14 shrink-0 lg:hidden" aria-hidden="true" />

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          data-testid="mobile-backdrop"
          className="fixed inset-0 z-40 bg-zinc-950/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        data-testid="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-y-auto bg-zinc-900 text-white transition-transform duration-200 ease-out lg:static lg:w-64 lg:translate-x-0 lg:h-screen ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-start justify-between border-b border-zinc-800 p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-teal-500 font-heading text-sm font-black text-zinc-950">
                V
              </span>
              <h1 className="text-xl font-bold tracking-tight" data-testid="brand-name">
                Vektor
              </h1>
            </div>
            <p className="mt-1 text-xs tracking-[0.15em] text-zinc-400 uppercase">
              SA Tender Compliance
            </p>
          </div>
          <button
            type="button"
            data-testid="mobile-menu-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-sm hover:bg-zinc-800 lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={item.testId}
                className={`mb-1 flex w-full items-center gap-3 rounded-sm px-4 py-3 text-sm transition-colors ${isActive ? "bg-teal-600 font-semibold text-white shadow-[inset_3px_0_0_0_theme(colors.teal.300)]" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
              >
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-zinc-800 p-4" data-testid="user-info">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs tracking-[0.15em] text-zinc-500 uppercase">
                  Signed in as
                </p>
                <p className="truncate text-xs font-semibold" data-testid="user-email">
                  {user.email}
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-signout"
                onClick={async () => {
                  await authClient.signOut();
                  toast.success("Signed out");
                  navigate({ to: "/login" });
                }}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                →
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
