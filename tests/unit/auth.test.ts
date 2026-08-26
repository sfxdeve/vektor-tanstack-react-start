import { describe, expect, it } from "vitest";

import { authClient } from "@/lib/auth/auth-client";
import { createAuth } from "@/lib/auth/auth";

describe("Auth Server & Client", () => {
  it("initializes Better Auth server instance with D1", () => {
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

    const auth = createAuth(mockD1, {
      baseURL: "http://localhost:3000",
      secret: "super-secret-key-12345678901234567890",
    });

    expect(auth).toBeDefined();
    expect(auth.handler).toBeTypeOf("function");
    expect(auth.api).toBeDefined();
  });

  it("exports authClient with standard auth methods", () => {
    expect(authClient).toBeDefined();
    expect(authClient.signIn).toBeDefined();
    expect(authClient.signUp).toBeDefined();
    expect(authClient.signOut).toBeDefined();
    expect(authClient.useSession).toBeDefined();
  });
});
