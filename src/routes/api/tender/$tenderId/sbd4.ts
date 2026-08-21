import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { fetchOwnedTender } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";
import { generateSbd4 } from "@/lib/sbd";

export const Route = createFileRoute("/api/tender/$tenderId/sbd4")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const owned = await fetchOwnedTender(db, params.tenderId, session);
        if (owned instanceof Response) return owned;
        const { tender, company } = owned;

        const pdfBytes = await generateSbd4(company, tender);
        return new Response(
          new Blob([pdfBytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
          {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="SBD4-${params.tenderId}.pdf"`,
              "cache-control": "private, max-age=0",
            },
          },
        );
      },
    },
  },
});
