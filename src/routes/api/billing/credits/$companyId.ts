import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { getCredits } from "@/lib/credits";
import { fetchOwnedCompany } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";

export const Route = createFileRoute("/api/billing/credits/$companyId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const company = await fetchOwnedCompany(db, params.companyId, session);
        if (company instanceof Response) return company;

        return Response.json({
          company_id: params.companyId,
          credits: await getCredits(db, params.companyId),
          subscription: null,
        });
      },
    },
  },
});
