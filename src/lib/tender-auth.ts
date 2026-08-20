import { eq as drizzleEq } from "drizzle-orm";
const eq: (a: unknown, b: unknown) => unknown = drizzleEq as unknown as (
  a: unknown,
  b: unknown,
) => unknown;

import type { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { tenders } from "@/db/schema/tender";

/**
 * Ownership-scoped tender fetch — shared between /api/tender/$tenderId and
 * /api/tender/$tenderId/returnables/toggle to avoid Duplicated Code.
 * Returns the tender if owned (or admin), otherwise null.
 * Caller distinguishes 404 vs 403 via a second existence check if needed.
 */
export async function fetchOwnedTender(
  db: ReturnType<typeof createDb>,
  tenderId: string,
  userId: string,
  isAdmin: boolean,
) {
  const rows = await (
    db.select().from(tenders).where as unknown as (
      c: unknown,
    ) => Promise<(typeof tenders.$inferSelect)[]>
  )(eq(tenders.id, tenderId));
  const tender = rows[0];
  if (!tender) return null;
  if (isAdmin) return tender;
  const compRows = await (
    db.select().from(companies).where as unknown as (
      c: unknown,
    ) => Promise<(typeof companies.$inferSelect)[]>
  )(eq(companies.id, tender.companyId));
  const company = compRows[0];
  if (!company || company.userId !== userId) return null;
  return tender;
}
