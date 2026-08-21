import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { getBankDetails } from "@/lib/eft";

export const Route = createFileRoute("/api/eft/bank-details")({
  server: {
    handlers: {
      GET: async () => {
        const details = getBankDetails(env as unknown as Record<string, string | undefined>);
        return Response.json(details);
      },
    },
  },
});
