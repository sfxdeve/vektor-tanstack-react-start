import { authClient } from "@/lib/auth/auth-client";

export function ImpersonationBanner() {
  const { data: session } = authClient.useSession();
  if (!session?.user || !session.session) return null;
  const impersonatedBy = (session.session as unknown as { impersonatedBy?: string })
    ?.impersonatedBy;
  const user = session.user as unknown as { role?: string } | undefined;

  // Only show when session indicates impersonation
  if (!impersonatedBy || !user) return null;

  const stop = async () => {
    try {
      await (
        authClient as unknown as { admin: { stopImpersonating: () => Promise<void> } }
      ).admin.stopImpersonating();
      window.location.href = "/admin";
    } catch {
      // fallback
      window.location.href = "/admin";
    }
  };

  return (
    <div
      data-testid="impersonation-banner"
      className="sticky top-0 z-50 flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950"
    >
      <span>Impersonating {session.user.email} — admin view</span>
      <button
        type="button"
        data-testid="impersonation-exit"
        onClick={stop}
        className="rounded-sm border border-zinc-900 bg-zinc-950 px-3 py-1 text-xs font-bold tracking-[0.08em] text-white uppercase hover:bg-zinc-800"
      >
        Exit impersonation
      </button>
    </div>
  );
}
