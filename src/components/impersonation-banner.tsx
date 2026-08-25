import { asVektorSession, authClient } from "@/lib/auth/auth-client";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const { data } = authClient.useSession();
  const session = asVektorSession(data);
  if (!session?.user || !session.session) return null;
  // Only show when an admin is wearing a user hat.
  if (!session.session.impersonatedBy) return null;

  const stop = async () => {
    try {
      const result = await authClient.admin.stopImpersonating();
      if (result.error) {
        toast.error(result.error.message || "Could not exit impersonation");
        return;
      }
      window.location.href = "/admin";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not exit impersonation");
    }
  };

  return (
    <div
      data-testid="impersonation-banner"
      className="fixed inset-x-0 top-0 z-[60] flex min-h-10 items-center justify-between bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950"
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
