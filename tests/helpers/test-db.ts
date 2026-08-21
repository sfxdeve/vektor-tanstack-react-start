import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import { type Database } from "@/db";
import * as schema from "@/db/schema";

/**
 * Real-SQLite test database for the domain rules the spec names
 * (credit consume/refund, sent_reminders idempotency). Uses Node's built-in
 * `node:sqlite` through drizzle's sqlite-proxy — same SQL semantics (unique
 * indexes, atomic UPDATE guards, FK cascade) as D1 in production. The schema
 * is applied straight from the generated Drizzle migrations in `drizzle/`,
 * so tests can never drift from the production DDL.
 */
export function createTestDb(): Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }
      // Same positional mapping drizzle's own D1 driver applies to name-keyed
      // result objects — keeps test/production row-shaping identical.
      const rows = stmt.all(...params).map((row) => Object.values(row));
      if (method === "get") return { rows: rows.slice(0, 1) };
      return { rows };
    },
    { schema },
  ) as unknown as Database;
}
