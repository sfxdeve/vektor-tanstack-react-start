import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [adminClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * The server adds role / referralCode / impersonation fields that the client
 * bundle cannot infer from the Worker-only auth factory. Every read site goes
 * through this single narrowing point instead of casting ad hoc.
 */
export interface VektorSessionData {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    role?: "admin" | "user" | null;
    referralCode?: string | null;
  } | null;
  session?: { id: string; impersonatedBy?: string | null } | null;
}

export function asVektorSession(data: unknown): VektorSessionData | null {
  return (data ?? null) as VektorSessionData | null;
}
