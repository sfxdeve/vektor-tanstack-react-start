import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/auth/session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const session = await getCurrentSession();
    if (!session?.user) {
      const path = location.pathname;
      throw redirect({
        to: "/login",
        search:
          path === "/app" ||
          path === "/setup" ||
          path === "/documents" ||
          path === "/analyze" ||
          path === "/billing" ||
          path === "/help"
            ? { redirect: path }
            : {},
        replace: true,
      });
    }
    if (session.user.role === "admin" && !session.session.impersonatedBy) {
      throw redirect({ to: "/admin" });
    }
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <ImpersonationBanner />
      <SidebarProvider
        className="min-h-svh"
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar": "#18181b",
            "--sidebar-foreground": "#fafafa",
            "--sidebar-accent": "#27272a",
            "--sidebar-accent-foreground": "#fafafa",
            "--sidebar-border": "#27272a",
            "--sidebar-primary": "#14b8a6",
            "--sidebar-primary-foreground": "#09090b",
            "--sidebar-ring": "#2dd4bf",
          } as CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
