import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companies } from "./company";

export const companyCredits = sqliteTable("company_credits", {
  companyId: text("companyId")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull().default(0),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export type CompanyCreditsRow = typeof companyCredits.$inferSelect;
