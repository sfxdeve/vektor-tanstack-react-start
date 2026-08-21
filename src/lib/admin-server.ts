import { getSessionFromRequest } from "@/lib/server-auth";
import { getUserRole, isImpersonating } from "@/lib/admin-client";
import type { SessionLike } from "@/lib/admin-client";

export async function requireAdmin(request: Request): Promise<SessionLike | Response> {
  const session = (await getSessionFromRequest(request)) as SessionLike;
  if (!session?.user) {
    return new Response(JSON.stringify({ detail: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const role = getUserRole(session);
  if (role !== "admin") {
    return new Response(JSON.stringify({ detail: "Admin access required" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  if (isImpersonating(session)) {
    return new Response(JSON.stringify({ detail: "Admin access required" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return session;
}
