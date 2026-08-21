import { authClient } from "@/lib/auth/auth-client";
import type { VektorSessionData } from "@/lib/auth/auth-client";

export function ImpersonationBanner() {
  const { data } = authClient.useSession();
  const session = data as VektorSessionData | null;
  if (!session?.user || !session.session) return null;
  // Only show when an admin is wearing a user hat.
  if (!session.session.impersonatedBy) return null;

  const stop = async () => {
    try {
      await authClient.admin.stopImpersonating();
      window.location.href = "/admin";
    } catch {
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
        onClick={() => void stop()}
        className="rounded-sm border border-zinc-900 bg-zinc-950 px-3 py-1 text-xs font-bold tracking-[0.08em] text-white uppercase hover:bg-zinc-800"
      >
        Exit impersonation
      </button>
    </div>
  );
}
