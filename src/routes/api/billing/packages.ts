import { createFileRoute } from "@tanstack/react-router";

import { CATALOG, toPackageApi } from "@/lib/billing-catalog";

export const Route = createFileRoute("/api/billing/packages")({
  server: {
    handlers: {
      GET: async () => {
        const packages = CATALOG.map(toPackageApi);
        return new Response(JSON.stringify({ packages }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
