export type UserRole = "admin" | "user";
export type SessionLike = {
  user?: { role?: string } | null;
  session?: { impersonatedBy?: string } | null;
} | null;

export function getUserRole(session: SessionLike): UserRole | undefined {
  const role = (session?.user as unknown as { role?: string } | undefined)?.role;
  return role === "admin" || role === "user" ? role : undefined;
}

export function isImpersonating(session: SessionLike): boolean {
  return Boolean((session?.session as unknown as { impersonatedBy?: string } | undefined)?.impersonatedBy);
}

export function isAdmin(session: SessionLike): boolean {
  return getUserRole(session) === "admin" && !isImpersonating(session);
}

export type EftStatusTone = "green" | "red" | "amber" | "teal" | "zinc";

export function toneClass(tone: EftStatusTone): string {
  const map: Record<EftStatusTone, string> = {
    green: "border-green-500/30 bg-green-500/10 text-green-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    zinc: "border-zinc-700 bg-zinc-800 text-zinc-300",
  };
  return map[tone];
}
