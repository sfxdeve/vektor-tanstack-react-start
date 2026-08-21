export type UserRole = "admin" | "user";

export interface ClientSession {
  user?: { role?: string | null } | null;
  session?: { impersonatedBy?: string | null } | null;
}

export function getUserRole(session: ClientSession): UserRole | undefined {
  const role = session?.user?.role;
  return role === "admin" || role === "user" ? role : undefined;
}

export function isImpersonating(session: ClientSession): boolean {
  return Boolean(session?.session?.impersonatedBy);
}
