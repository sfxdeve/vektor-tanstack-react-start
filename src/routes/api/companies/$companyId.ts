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

export const Route = createFileRoute("/api/companies/$companyId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);
        const rows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const row = rows[0];
        if (!row) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin && row.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(toApiCompany(row)), {
          headers: { "content-type": "application/json" },
        });
      },
      PATCH: async ({ request, params }) => {
        const session = await getSession(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const companyId = (params as Record<string, string>).companyId;
        const db = createDb(env.DB as unknown as D1Database);
        const rows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const row = rows[0];
        if (!row) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";
        if (!isAdmin && row.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
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

        const updates: Record<string, unknown> = {};
        const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

        // Map snake_case and camelCase
        const map: Record<string, string> = {
          company_name: "companyName",
          companyName: "companyName",
          cipc_num: "cipcNum",
          cipcNum: "cipcNum",
          csd_maaa_num: "csdMaaaNum",
          csdMaaaNum: "csdMaaaNum",
          sars_tcs_pin: "sarsTcsPin",
          sarsTcsPin: "sarsTcsPin",
          cidb_crs_num: "cidbCrsNum",
          cidbCrsNum: "cidbCrsNum",
          contact_email: "contactEmail",
          contactEmail: "contactEmail",
          contact_phone: "contactPhone",
          contact_phone2: "contactPhone",
          contactPhone: "contactPhone",
          authorised_signatory_name: "authorisedSignatoryName",
          authorisedSignatoryName: "authorisedSignatoryName",
          authorised_signatory_position: "authorisedSignatoryPosition",
          authorisedSignatoryPosition: "authorisedSignatoryPosition",
        };

        for (const [apiKey, dbKey] of Object.entries(map)) {
          if (has(apiKey)) {
            const v = body[apiKey];
            const nullIfBlank = (val: unknown) =>
              typeof val === "string" && (val as string).trim() === ""
                ? null
                : ((val as string) ?? null);
            // For company_name and cipc_num, require non-empty if provided
            if (
              (dbKey === "companyName" || dbKey === "cipcNum") &&
              typeof v === "string" &&
              v.trim() === ""
            ) {
              return new Response(JSON.stringify({ detail: `${apiKey} cannot be empty` }), {
                status: 400,
                headers: { "content-type": "application/json" },
              });
            }
            if (dbKey === "companyName" || dbKey === "cipcNum") {
              updates[dbKey] = typeof v === "string" ? v.trim() : v;
            } else {
              updates[dbKey] = nullIfBlank(v);
            }
          }
        }

        if (has("bbbee_level") || has("bbbeeLevel")) {
          const raw = has("bbbee_level") ? body.bbbee_level : body.bbbeeLevel;
          if (raw == null || raw === "") {
            updates["bbbeeLevel"] = null;
          } else {
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 1 || n > 8) {
              return new Response(
                JSON.stringify({ detail: "bbbee_level must be between 1 and 8" }),
                { status: 400, headers: { "content-type": "application/json" } },
              );
            }
            updates["bbbeeLevel"] = n;
          }
        }

        if (has("bargaining_councils") || has("bargainingCouncils")) {
          const raw = has("bargaining_councils")
            ? body.bargaining_councils
            : body.bargainingCouncils;
          try {
            const validated = validateCouncils(raw);
            updates["bargainingCouncils"] = validated ? JSON.stringify(validated) : null;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Invalid bargaining councils";
            return new Response(JSON.stringify({ detail: msg }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
        }

        if (has("preferred_pppfa_system") || has("preferredPppfaSystem")) {
          const raw = has("preferred_pppfa_system")
            ? body.preferred_pppfa_system
            : body.preferredPppfaSystem;
          try {
            const validated = validatePppfa(raw);
            updates["preferredPppfaSystem"] = validated;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Invalid PPPFA";
            return new Response(JSON.stringify({ detail: msg }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
        }

        if (has("alerts_enabled") || has("alertsEnabled")) {
          const raw = has("alerts_enabled") ? body.alerts_enabled : body.alertsEnabled;
          updates["alertsEnabled"] = Boolean(raw);
        }

        if (Object.keys(updates).length === 0) {
          return new Response(JSON.stringify(toApiCompany(row)), {
            headers: { "content-type": "application/json" },
          });
        }

        (updates as Record<string, unknown>).updatedAt = new Date();

        await (
          db.update(companies).set as unknown as (v: unknown) => {
            where: (c: unknown) => Promise<unknown>;
          }
        )(updates as never).where(eq(companies.id, companyId));
        const updated = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId)).then((r) => r[0]!);
        return new Response(JSON.stringify(toApiCompany(updated)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
