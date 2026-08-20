-- Better Auth 1.7: account.issuer + unique (issuer, accountId)
-- See https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer
-- This project only uses credential provider (emailAndPassword). For existing D1 rows
-- with providerId='credential', backfill issuer='local:credential' before enforcing NOT NULL.
-- SQLite cannot ADD COLUMN NOT NULL to a non-empty table without a default, so for any
-- DB that already has account rows, run the backfill below BEFORE this migration, or
-- replace this file with the 3-step variant:
--   1) ALTER TABLE "account" ADD COLUMN "issuer" text;
--   2) UPDATE "account" SET "issuer" = CASE WHEN "providerId"='credential' THEN 'local:credential' WHEN "providerId"='siwe' THEN 'local:siwe' WHEN "providerId"='google' THEN 'https://accounts.google.com' ELSE 'local:oauth:' || "providerId" END WHERE "issuer" IS NULL;
--   3) Rebuild table to add NOT NULL (CREATE TABLE account_new ... TEXT NOT NULL ..., INSERT SELECT, DROP, RENAME) then CREATE UNIQUE INDEX
-- For fresh/empty D1 (local dev), the simple statements below succeed.
ALTER TABLE `account` ADD `issuer` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`accountId`);
