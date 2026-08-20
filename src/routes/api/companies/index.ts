import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { VALID_COUNCIL_CODES } from "@/lib/bargaining-councils";

const VALID_PPPFA = new Set(["80/20", "90/10"]);

function validateCouncils(codes: unknown): string[] | null {
  if (codes == null) return null;
  if (!Array.isArray(codes)) throw new Error("bargaining_councils must be an array");
  const unique = [...new Set(codes as string[])];
  const unknown = unique.filter((c) => !VALID_COUNCIL_CODES.has(c));
  if (unknown.length > 0) {
    throw new Error(`Unknown bargaining council code(s): ${unknown.join(", ")}`);
  }
  return unique;
}

function validatePppfa(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !VALID_PPPFA.has(value)) {
    throw new Error(
      `Invalid PPPFA preference system: ${String(value as string)}. Must be one of 80/20, 90/10`,
    );
  }
  return value;
}

function toApiCompany(row: typeof companies.$inferSelect) {
  return {
    id: row.id,
    company_name: row.companyName,
    cipc_num: row.cipcNum,
    csd_maaa_num: row.csdMaaaNum,
    sars_tcs_pin: row.sarsTcsPin,
    cidb_crs_num: row.cidbCrsNum,
    bbbee_level: row.bbbeeLevel,
    contact_email: row.contactEmail,
    contact_phone: row.contactPhone,
    authorised_signatory_name: row.authorisedSignatoryName,
    authorised_signatory_position: row.authorisedSignatoryPosition,
    bargaining_councils: row.bargainingCouncils ? JSON.parse(row.bargainingCouncils) : [],
    preferred_pppfa_system: row.preferredPppfaSystem,
    alerts_enabled: row.alertsEnabled,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
    user_id: row.userId,
  };
}

async function getSession(request: Request) {
  const { createAuth } = await import("@/lib/auth/auth");
  const auth = createAuth(env.DB as unknown as D1Database);
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export const Route = createFileRoute("/api/companies/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        const rows = isAdmin
          ? await db.select().from(companies)
          : await (
              db.select().from(companies).where as unknown as (
                c: unknown,
              ) => Promise<(typeof companies.$inferSelect)[]>
            )(eq(companies.userId, session.user.id));
        const data = rows.map(toApiCompany);
        return new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const companyName = (body.company_name ?? body.companyName ?? "") as string;
        const cipcNum = (body.cipc_num ?? body.cipcNum ?? "") as string;
        if (!companyName || !cipcNum) {
          return new Response(
            JSON.stringify({ detail: "Company name and CIPC number are required" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const bbbeeRaw = body.bbbee_level ?? body.bbbeeLevel;
        let bbbeeLevel: number | null = null;
        if (bbbeeRaw != null && bbbeeRaw !== "") {
          const n = Number(bbbeeRaw);
          if (!Number.isInteger(n) || n < 1 || n > 8) {
            return new Response(JSON.stringify({ detail: "bbbee_level must be between 1 and 8" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          bbbeeLevel = n;
        }

        let bargainingCouncils: string[] | null;
        try {
          bargainingCouncils = validateCouncils(
            body.bargaining_councils ?? body.bargainingCouncils,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid bargaining councils";
          return new Response(JSON.stringify({ detail: msg }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        let preferredPppfa: string | null;
        try {
          preferredPppfa = validatePppfa(body.preferred_pppfa_system ?? body.preferredPppfaSystem);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid PPPFA";
          return new Response(JSON.stringify({ detail: msg }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const nullIfBlank = (v: unknown) =>
          typeof v === "string" && v.trim() === "" ? null : ((v as string) ?? null);

        const now = new Date();
        const id = crypto.randomUUID();
        const db = createDb(env.DB as unknown as D1Database);
        const row = {
          id,
          userId: session.user.id,
          companyName: (companyName as string).trim(),
          cipcNum: (cipcNum as string).trim(),
          csdMaaaNum: nullIfBlank(body.csd_maaa_num ?? body.csdMaaaNum),
          sarsTcsPin: nullIfBlank(body.sars_tcs_pin ?? body.sarsTcsPin),
          cidbCrsNum: nullIfBlank(body.cidb_crs_num ?? body.cidbCrsNum),
          bbbeeLevel,
          contactEmail: nullIfBlank(body.contact_email ?? body.contactEmail),
          contactPhone: nullIfBlank(body.contact_phone ?? body.contactPhone),
          authorisedSignatoryName: nullIfBlank(
            body.authorised_signatory_name ?? body.authorisedSignatoryName,
          ),
          authorisedSignatoryPosition: nullIfBlank(
            body.authorised_signatory_position ?? body.authorisedSignatoryPosition,
          ),
          bargainingCouncils: bargainingCouncils ? JSON.stringify(bargainingCouncils) : null,
          preferredPppfaSystem: preferredPppfa,
          alertsEnabled:
            body.alerts_enabled !== false && (body.alertsEnabled as boolean | undefined) !== false,
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(companies).values(row);
        const created = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, id)).then((r) => r[0]!);
        return new Response(JSON.stringify(toApiCompany(created)), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
