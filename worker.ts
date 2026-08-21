/**
 * Cloudflare Worker entry for TanStack Start.
 *
 * Re-exports the framework's fetch handler as the default export and adds the
 * `scheduled` cron handler (Compliance Guardian daily sweep, 08:00 SAST =
 * 0 6 * * * UTC per wrangler.jsonc). This is the canonical Workers pattern:
 * one entry module exporting every handler the runtime invokes.
 */
import serverEntry from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { createDb } from "@/db";
import { sweepAndSend } from "@/lib/reminder";

export default serverEntry;

export async function scheduled(
  _controller: ScheduledController,
  workerEnv: typeof env,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    sweepAndSend(createDb(workerEnv.DB), workerEnv as unknown as Record<string, string | undefined>)
      .then(({ sent, skipped, failed }) => {
        console.log(`[cron] compliance sweep done`, { sent, skipped, failed });
      })
      .catch((e) => {
        console.error("[cron] compliance sweep failed", e);
      }),
  );
}
