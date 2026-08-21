import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { ensureCredits } from "@/lib/credits";
import {
  nullIfBlank,
  toApiCompany,
  validateCouncils,
  validatePppfa,
} from "@/lib/company-validation";
import { requireUser } from "@/lib/server-auth";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/companies/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const db = createDb(env.DB);
        const isAdmin = session.user.role === "admin";
        const rows = isAdmin
          ? await db.select().from(companies)
          : await db.select().from(companies).where(eq(companies.userId, session.user.id));
        return Response.json(rows.map(toApiCompany));
      },
      POST: async ({ request }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return Response.json({ detail: "Invalid JSON" }, { status: 400 });

        const companyName = asString(body.company_name).trim();
        const cipcNum = asString(body.cipc_num).trim();
        if (!companyName || !cipcNum) {
          return Response.json(
            { detail: "Company name and CIPC number are required" },
            { status: 400 },
          );
        }

        let bbbeeLevel: number | null = null;
        if (body.bbbee_level != null && body.bbbee_level !== "") {
          const n = Number(body.bbbee_level);
          if (!Number.isInteger(n) || n < 1 || n > 8) {
            return Response.json(
              { detail: "bbbee_level must be between 1 and 8" },
              { status: 400 },
            );
          }
          bbbeeLevel = n;
        }

        let bargainingCouncils: string[] | null;
        try {
          bargainingCouncils = validateCouncils(body.bargaining_councils);
        } catch (e) {
          return Response.json(
            { detail: e instanceof Error ? e.message : "Invalid bargaining councils" },
            { status: 400 },
          );
        }

        let preferredPppfa: string | null;
        try {
          preferredPppfa = validatePppfa(body.preferred_pppfa_system);
        } catch (e) {
          return Response.json(
            { detail: e instanceof Error ? e.message : "Invalid PPPFA preference system" },
            { status: 400 },
          );
        }

        const now = new Date();
        const id = crypto.randomUUID();
        const db = createDb(env.DB);

        await db.insert(companies).values({
          id,
          userId: session.user.id,
          companyName,
          cipcNum,
          csdMaaaNum: nullIfBlank(body.csd_maaa_num),
          sarsTcsPin: nullIfBlank(body.sars_tcs_pin),
          cidbCrsNum: nullIfBlank(body.cidb_crs_num),
          bbbeeLevel,
          contactEmail: nullIfBlank(body.contact_email),
          contactPhone: nullIfBlank(body.contact_phone),
          authorisedSignatoryName: nullIfBlank(body.authorised_signatory_name),
          authorisedSignatoryPosition: nullIfBlank(body.authorised_signatory_position),
          bargainingCouncils: bargainingCouncils ? JSON.stringify(bargainingCouncils) : null,
          preferredPppfaSystem: preferredPppfa,
          alertsEnabled: body.alerts_enabled !== false,
          createdAt: now,
          updatedAt: now,
        });

        // One free trial credit per new company (plus any referral signup bonus,
        // which is 0 in the referrer-only program).
        await ensureCredits(db, id, 1);

        const created = (await db.select().from(companies).where(eq(companies.id, id)))[0]!;
        return Response.json(toApiCompany(created), { status: 201 });
      },
    },
  },
});
