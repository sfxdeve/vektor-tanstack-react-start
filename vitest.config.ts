import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: [
      "tests/unit/verification.test.ts",
      "tests/unit/cidb.test.ts",
      "tests/unit/bargaining.test.ts",
      "tests/unit/bbbee.test.ts",
      "tests/unit/compliance.test.ts",
      "tests/unit/credits.test.ts",
      "tests/unit/referral.test.ts",
      "tests/unit/reminder.test.ts",
      "tests/unit/reminder-idempotency.test.ts",
      "tests/unit/sbd.test.ts",
    ],
  },
});
