import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BuildingIcon,
  CircleHelpIcon,
  CreditCardIcon,
  FileTextIcon,
  HouseIcon,
  InfoIcon,
  LogOutIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { VektorMark } from "@/components/vektor-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { asVektorSession, authClient } from "@/lib/auth/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { to: "/app", label: "Dashboard", testId: "nav-dashboard", icon: HouseIcon },
  { to: "/analyze", label: "Analyze Tender", testId: "nav-analyze", icon: UploadIcon },
  { to: "/documents", label: "Document Vault", testId: "nav-documents", icon: FileTextIcon },
  { to: "/setup", label: "Company Setup", testId: "nav-setup", icon: BuildingIcon },
  { to: "/billing", label: "Billing & Credits", testId: "nav-billing", icon: CreditCardIcon },
  { to: "/help", label: "Help & Guides", testId: "nav-help", icon: CircleHelpIcon },
  { to: "/about", label: "About Vektor", testId: "nav-about", icon: InfoIcon },
] as const;

function NavLinks() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.to;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.label}
                  render={
                    <Link
                      to={item.to}
                      data-testid={item.testId}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                  className={
                    isActive
                      ? "bg-teal-500 font-semibold text-zinc-950 shadow-[inset_3px_0_0_0_theme(colors.teal.300)] hover:bg-teal-500 hover:text-zinc-950"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserFooter() {
  const navigate = useNavigate();
  const { data: rawData } = authClient.useSession();
  const user = asVektorSession(rawData)?.user;
  if (!user) return null;
  const initials = (user.name || user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="px-2 py-1" data-testid="user-info">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              data-testid="user-menu-trigger"
            />
          }
        >
          <Avatar size="sm" className="rounded-sm">
            <AvatarFallback className="rounded-sm bg-zinc-800 text-[10px] font-bold text-zinc-200">
              {initials || "V"}
            </AvatarFallback>
          </Avatar>
          <span
            className="min-w-0 flex-1 truncate text-left text-xs font-semibold"
            data-testid="user-email"
          >
            {user.email}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 rounded-sm">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs tracking-[0.15em] uppercase">
              Signed in as
            </DropdownMenuLabel>
            <p className="truncate px-1.5 pb-1 text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              data-testid="btn-signout"
              onClick={async () => {
                await authClient.signOut();
                toast.success("Signed out");
                await navigate({ to: "/login", search: {} });
              }}
            >
              <LogOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppSidebar() {
  return (
    <>
      <div
        data-testid="mobile-topbar"
        className="fixed inset-x-0 top-[var(--impersonation-banner-height)] z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 text-white md:hidden"
      >
        <SidebarTrigger
          data-testid="mobile-menu-open"
          aria-label="Open navigation"
          className="-ml-2 text-white hover:bg-zinc-800 hover:text-white"
        />
        <div className="flex items-center gap-2">
          <VektorMark className="h-6 w-6 text-xs" />
          <span className="text-lg font-bold tracking-tight">Vektor</span>
        </div>
        <div className="h-10 w-10" aria-hidden="true" />
      </div>
      <div className="h-14 shrink-0 md:hidden" aria-hidden="true" />

      <Sidebar
        collapsible="offcanvas"
        data-testid="sidebar"
        className="border-zinc-800 bg-zinc-900 text-white"
      >
        <nav aria-label="Vektor navigation" className="flex size-full flex-col">
          <SidebarHeader className="border-b border-zinc-800 p-6">
            <div className="flex items-center gap-2.5">
              <VektorMark />
              <h1 className="text-xl font-bold tracking-tight" data-testid="brand-name">
                Vektor
              </h1>
            </div>
            <p className="mt-1 text-xs tracking-[0.15em] text-zinc-400 uppercase">
              SA Tender Compliance
            </p>
          </SidebarHeader>
          <SidebarContent>
            <NavLinks />
          </SidebarContent>
          <SidebarFooter className="border-t border-zinc-800">
            <UserFooter />
          </SidebarFooter>
        </nav>
      </Sidebar>
    </>
  );
}
