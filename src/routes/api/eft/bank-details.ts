import { createFileRoute } from "@tanstack/react-router";
import { env as cfEnv } from "cloudflare:workers";

import { getBankDetails } from "@/lib/eft";

export const Route = createFileRoute("/api/eft/bank-details")({
  server: {
    handlers: {
      GET: async () => {
        const env = (cfEnv as unknown as Record<string, string | undefined>) ?? {};
        // fallback to process.env for vite preview
        const merged: Record<string, string | undefined> = { ...env };
        if (typeof process !== "undefined" && process.env) {
          for (const k of [
            "EFT_BANK_NAME",
            "EFT_ACCOUNT_HOLDER",
            "EFT_ACCOUNT_NUMBER",
            "EFT_BRANCH_CODE",
            "EFT_ACCOUNT_TYPE",
          ]) {
            if (!merged[k] && process.env[k]) merged[k] = process.env[k];
          }
        }
        const details = getBankDetails(merged);
        return new Response(JSON.stringify(details), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
