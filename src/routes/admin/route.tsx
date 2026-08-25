import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin-layout";
import { getCurrentSession } from "@/lib/auth/session";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await getCurrentSession();
    if (!session?.user) {
      throw redirect({ to: "/login", search: {} });
    }
    if (session.user.role !== "admin" || session.session.impersonatedBy) {
      throw redirect({ to: "/app" });
    }
    return { session };
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
