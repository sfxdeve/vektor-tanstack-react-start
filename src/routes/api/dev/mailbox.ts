import { createFileRoute } from "@tanstack/react-router";
import { clearEmails, listEmails } from "@/lib/dev-mailbox";
import { runtimeEnv } from "@/lib/runtime-env";

function isAllowed(request: Request): boolean {
  if (runtimeEnv.DEV_MAILBOX !== "1") return false;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function notAvailable(): Response {
  return Response.json({ detail: "Not available" }, { status: 404 });
}

export const Route = createFileRoute("/api/dev/mailbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAllowed(request)) return notAvailable();
        return Response.json(listEmails());
      },
      DELETE: async ({ request }) => {
        if (!isAllowed(request)) return notAvailable();
        const cleared = listEmails().length;
        clearEmails();
        return Response.json({ ok: true, cleared });
      },
    },
  },
});
