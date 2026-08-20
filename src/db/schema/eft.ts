import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companies } from "./company";
import { user } from "./auth";

export const eftPayments = sqliteTable(
  "eft_payments",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userEmail: text("userEmail").notNull(),
    companyId: text("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    companyName: text("companyName").notNull().default(""),
    lookupKey: text("lookupKey").notNull(),
    packageName: text("packageName").notNull(),
    amount: integer("amount").notNull(), // store cents? but spec uses amount float; store cents as integer for safety, expose as rands
    // amountCents stored as integer cents; api exposes amount as rands (cents/100)
    credits: integer("credits").notNull(),
    annualCredits: integer("annualCredits"),
    billingPeriod: text("billingPeriod").notNull(),
    type: text("type", { enum: ["subscription", "one_time"] }).notNull(),
    status: text("status", {
      enum: ["awaiting_proof", "pending_review", "confirmed", "rejected"],
    })
      .notNull()
      .default("awaiting_proof"),
    proofPath: text("proofPath"),
    proofContentType: text("proofContentType"),
    proofFilename: text("proofFilename"),
    rejectReason: text("rejectReason"),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
    confirmedAt: integer("confirmedAt", { mode: "timestamp" }),
    confirmedBy: text("confirmedBy"),
    rejectedAt: integer("rejectedAt", { mode: "timestamp" }),
    rejectedBy: text("rejectedBy"),
    creditsGranted: integer("creditsGranted"),
  },
  (t) => [
    index("eft_userId_idx").on(t.userId),
    index("eft_companyId_idx").on(t.companyId),
    index("eft_status_idx").on(t.status),
    index("eft_createdAt_idx").on(t.createdAt),
  ],
);

export type EftPaymentRow = typeof eftPayments.$inferSelect;
export type EftPaymentInsert = typeof eftPayments.$inferInsert;
