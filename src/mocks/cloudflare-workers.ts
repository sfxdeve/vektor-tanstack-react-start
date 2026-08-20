export const env: Record<string, string | undefined> =
  (globalThis as unknown as { process?: { env: Record<string, string> } }).process?.env ?? {};
