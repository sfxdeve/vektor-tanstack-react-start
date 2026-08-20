import { createFileRoute } from "@tanstack/react-router";

import { listCouncilsPublic } from "@/lib/bargaining-councils";

export const Route = createFileRoute("/api/reference/bargaining-councils")({
  server: {
    handlers: {
      GET: async () => {
        const councils = listCouncilsPublic();
        return new Response(JSON.stringify({ councils }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
