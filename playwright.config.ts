import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 2,
  // Serial everywhere: two engines × N workers hammering one workerd/D1
  // instance causes cross-test slowness spikes that show up as flakes. The
  // gate must be deterministic — pass --workers=N on the CLI for quick local
  // iteration if you accept that trade-off.
  workers: 1,
  reporter: "list",
  // Headroom for load spikes when two engines run in parallel against one
  // workerd instance; individual long journeys override via test.setTimeout.
  timeout: 60_000,
  use: {
    // Override with E2E_BASEURL=https://<preview>.workers.dev to run specs
    // (including the smoke journey) against a `wrangler versions upload` preview
    baseURL: process.env.E2E_BASEURL ?? "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // strictPort: if something already holds 4173 (e.g. a stale preview
    // serving a replaced dist/), fail loudly instead of silently reusing or
    // drifting to another port.
    command: "nub run preview --host 127.0.0.1 --port 4173 --strictPort",
    // Reuse only on explicit opt-in for quick local iteration; gate runs
    // always boot a fresh server matching the freshly built dist/.
    reuseExistingServer:
      process.env.E2E_REUSE === "1" && !process.env.CI && !process.env.E2E_BASEURL,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: "http://127.0.0.1:4173",
  },
});
