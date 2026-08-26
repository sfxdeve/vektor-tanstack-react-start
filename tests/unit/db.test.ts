import { describe, expect, it } from "vitest";

import { account, session, user, verification } from "@/db/schema";
import { createDb } from "@/db";

describe("Database Schema & Client", () => {
  it("exports auth tables with expected columns", () => {
    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.emailVerified).toBeDefined();

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.userId).toBeDefined();
    expect(session.token).toBeDefined();

    expect(account).toBeDefined();
    expect(account.id).toBeDefined();
    expect(account.userId).toBeDefined();
    expect(account.providerId).toBeDefined();

    expect(verification).toBeDefined();
    expect(verification.id).toBeDefined();
    expect(verification.identifier).toBeDefined();
  });

  it("creates a drizzle database instance with mock D1 database", () => {
    const mockD1 = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ success: true }),
        }),
      }),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
      dump: async () => new ArrayBuffer(0),
    } as unknown as D1Database;

    const db = createDb(mockD1);
    expect(db).toBeDefined();
    expect(typeof db.select).toBe("function");
  });
});
