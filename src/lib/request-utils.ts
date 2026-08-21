/** Shared request-parsing helpers for API route handlers. */

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Coerce an unknown JSON value to its string form ("" for anything else). */
export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function jsonError(detail: string, status: number): Response {
  return Response.json({ detail }, { status });
}
