import { ImpersonationBanner } from "@/components/impersonation-banner";

export function AdminShell({
  active,
  children,
}: {
  active: "overview" | "users" | "companies" | "eft";
  children: React.ReactNode;
}) {
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
            <a
              href="/admin"
              data-testid="admin-nav-overview"
              className={
                active === "overview"
                  ? "font-semibold text-white"
                  : "text-zinc-400 hover:text-white"
              }
            >
              Overview
            </a>
            <a
              href="/admin/users"
              data-testid="admin-nav-users"
              className={
                active === "users" ? "font-semibold text-white" : "text-zinc-400 hover:text-white"
              }
            >
              Users
            </a>
            <a
              href="/admin/companies"
              data-testid="admin-nav-companies"
              className={
                active === "companies"
                  ? "font-semibold text-white"
                  : "text-zinc-400 hover:text-white"
              }
            >
              Companies
            </a>
            <a
              href="/admin/eft"
              data-testid="admin-nav-eft"
              className={
                active === "eft" ? "font-semibold text-white" : "text-zinc-400 hover:text-white"
              }
            >
              EFT
            </a>
          </nav>
        </div>
      </header>
      <main className="p-6 sm:p-8">{children}</main>
    </div>
  );
}
