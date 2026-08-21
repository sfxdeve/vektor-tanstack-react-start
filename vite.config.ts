import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

function cronScheduledPatch() {
  return {
    name: "vektor-cron-scheduled-patch",
    closeBundle: {
      sequential: true,
      async handler() {
        const file = path.resolve("dist/server/index.js");
        if (!fs.existsSync(file)) return;
        const code = fs.readFileSync(file, "utf8");
        if (code.includes("export async function scheduled") || code.includes("export { scheduled"))
          return;
        let routerChunk = "router-BOw4esdp.js";
        try {
          const manifestPath = path.resolve("dist/server/.vite/manifest.json");
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            const entry = manifest["src/router.tsx"] as { file?: string } | undefined;
            if (entry?.file) routerChunk = entry.file.replace(/^assets\//, "");
            const candidate = path.resolve("dist/server/assets", routerChunk);
            if (!fs.existsSync(candidate)) {
              const assets = fs.readdirSync(path.resolve("dist/server/assets"));
              const found = assets.find((f) => f.startsWith("router-") && f.endsWith(".js"));
              if (found) routerChunk = found;
            }
          }
        } catch {}
        const fallback = `\nexport async function scheduled(event, env, ctx) {\n  console.log("[cron] scheduled", event?.cron ?? event?.scheduledTime, "08:00 SAST sweep");\n}\n`;

        if (!code.includes("scheduled")) {
          fs.appendFileSync(file, fallback, "utf8");
          console.log(`[vektor-cron] fallback patch applied with chunk ${routerChunk}`);
        }
      },
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    cronScheduledPatch(),
  ],
});
