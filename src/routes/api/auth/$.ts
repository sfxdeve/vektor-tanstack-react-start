import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "@/lib/auth/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = createAuth(env.DB);
        return await auth.handler(request);
      },
      POST: async ({ request }) => {
        const auth = createAuth(env.DB);
        return await auth.handler(request);
      },
    },
  },
});
