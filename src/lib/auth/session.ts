import { env } from "cloudflare:workers";

import { createAuth } from "./auth";

export async function getSession(request: Request) {
  const auth = createAuth(env.DB as unknown as D1Database);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export async function requireSession(request: Request) {
  const session = await getSession(request);
  if (!session?.user) {
    return null;
  }
  return session;
}
