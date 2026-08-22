import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ListIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";
import { useState } from "react";

const navItems = [
  { to: "/app", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/analyze", label: "Analyze Tender", testId: "nav-analyze" },
  { to: "/documents", label: "Document Vault", testId: "nav-documents" },
  { to: "/setup", label: "Company Setup", testId: "nav-setup" },
  { to: "/billing", label: "Billing & Credits", testId: "nav-billing" },
  { to: "/help", label: "Help & Guides", testId: "nav-help" },
  { to: "/about", label: "About Vektor", testId: "nav-about" },
] as const;

function VektorMark({ className = "h-7 w-7 text-sm" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-sm bg-teal-500 font-heading font-black text-zinc-950 ${className}`}
    >
      V
    </span>
  );
}

export { VektorMark };

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex-1 p-4">
      {navItems.map((item) => {
        const isActive = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            data-testid={item.testId}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`mb-1 flex w-full items-center gap-3 rounded-sm px-4 py-3 text-sm transition-colors ${
              isActive
                ? "bg-teal-500 font-semibold text-zinc-950 shadow-[inset_3px_0_0_0_theme(colors.teal.300)]"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <span className="text-sm">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserFooter() {
  const navigate = useNavigate();
  const { data: rawData } = authClient.useSession();
  const user = asVektorSession(rawData)?.user;
  if (!user) return null;
  return (
    <div className="border-t border-zinc-800 p-4" data-testid="user-info">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs tracking-[0.15em] text-zinc-400 uppercase">Signed in as</p>
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
            await navigate({ to: "/login" });
          }}
          aria-label="Sign out"
          title="Sign out"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <LogOutIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div
        data-testid="mobile-topbar"
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 text-white lg:hidden"
      >
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <button
                type="button"
                data-testid="mobile-menu-open"
                aria-label="Open navigation"
                className="-ml-2 flex h-10 w-10 items-center justify-center rounded-sm hover:bg-zinc-800"
              />
            }
          >
            <ListIcon className="h-5 w-5" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-72 gap-0 border-zinc-800 bg-zinc-900 p-0 text-white"
            aria-label="Navigation"
          >
            <SheetTitle className="sr-only">Vektor navigation</SheetTitle>
            <div className="flex items-center gap-2.5 border-b border-zinc-800 p-6">
              <VektorMark />
              <h2 className="text-xl font-bold tracking-tight" data-testid="brand-name-mobile">
                Vektor
              </h2>
            </div>
            <NavLinks onNavigate={close} />
            <UserFooter />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <VektorMark className="h-6 w-6 text-xs" />
          <span className="text-lg font-bold tracking-tight">Vektor</span>
        </div>
        <div className="h-10 w-10" aria-hidden="true" />
      </div>
      {/* Spacer so fixed mobile top bar never covers content */}
      <div className="h-14 shrink-0 lg:hidden" aria-hidden="true" />

      {/* Desktop sidebar — solid zinc-900 per design guidelines */}
      <aside
        data-testid="sidebar"
        className="fixed inset-y-0 left-0 z-20 hidden w-64 shrink-0 flex-col overflow-y-auto bg-zinc-900 text-white lg:static lg:flex lg:h-screen"
      >
        <div className="border-b border-zinc-800 p-6">
          <div className="flex items-center gap-2.5">
            <VektorMark />
            <h1 className="text-xl font-bold tracking-tight" data-testid="brand-name">
              Vektor
            </h1>
          </div>
          <p className="mt-1 text-xs tracking-[0.15em] text-zinc-400 uppercase">
            SA Tender Compliance
          </p>
        </div>
        <NavLinks />
        <UserFooter />
      </aside>
    </>
  );
}
