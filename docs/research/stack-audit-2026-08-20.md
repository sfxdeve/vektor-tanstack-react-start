# Research: vektor-tanstack-react-start stack audit (as of 2026-08-20)

## Summary

The repo is on **very current, essentially canonical** versions across the TanStack Start + Cloudflare + Vite + React 19 + Tailwind 4 stack. Most packages are the latest stable as of the `compatibility_date` 2026-08-15 (or 1 patch behind, released days ago). No stale majors, no deprecated choices. The few yellow flags are: `compatibility_flags: ["nodejs_compat"]` is now redundant, `vite.config.ts` plugin order differs subtly from the official Cloudflare template, `wrangler/vite-plugin/oxlint/oxfmt/better-auth/Vite/@vitejs/plugin-react` each have a one-patch/minor newer release, and `drizzle 0.45.2` is still stable while `1.0 RCs` are pre-release.

## Executive summary (per area)

| Area                                                       | Verdict                     | Detail                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node / package manager (mise, nub)**                     | 🟢 Green                    | Node `24.19.0` is the exact latest LTS ("Krypton") published 2026-08-03. `nub@0.7.5` is latest (0.7.4 was 1 day ago; 0.7.5 is current). Non-standard vs pnpm/bun but intentional.                                                                                         |
| **TanStack Start / Router**                                | 🟢 Green — 1 patch behind   | `react-start 1.168.46` + `router 1.170.29` were latest through 2026-08-14; latest as of 2026-08-20 is `start 1.168.48` / `router 1.170.31`. Update is trivial patch.                                                                                                      |
| **TanStack Query / Form / ssr-query**                      | 🟡 Yellow — ssr-query stale | `react-query 5.101.4` latest, `react-form 1.33.5` latest. `react-router-ssr-query 1.167.1` is from 2026-05-29 and has not had a release since; still the documented canonical package but pinned ~80 patches behind router. Watch known streaming regression (see below). |
| **React**                                                  | 🟢 Green                    | `19.2.8` is the absolute latest stable (2026-07-21). `@types/react 19.2.18` latest.                                                                                                                                                                                       |
| **Vite / @vitejs/plugin-react**                            | 🟡 Yellow                   | `vite 8.2.1` latest is `8.2.2` (2026-08-20); `plugin-react 6.0.5` latest is `6.1.0` (2026-08-20). Both 1-patch/minor behind, zero breaking changes.                                                                                                                       |
| **Cloudflare Vite plugin / Wrangler / compatibility_date** | 🟡 Yellow                   | `vite-plugin 1.52.1` vs `1.53.0`; `wrangler 4.123.0` vs `4.124.0`. `compatibility_date 2026-08-15` minus 5 days vs today (still current); `nodejs_compat` flag now redundant. Config otherwise canonical.                                                                 |
| **D1 / Drizzle**                                           | 🟢 Green                    | `drizzle-orm 0.45.2` / `drizzle-kit 0.31.10` are stable latest; `1.0.0-rc.4` exists but pre-release. Choice correct for production.                                                                                                                                       |
| **Auth (better-auth)**                                     | 🟡 Yellow                   | `1.6.29` vs latest `1.7.1` (released hours ago). Minor behind; review changelog.                                                                                                                                                                                          |
| **Tailwind / shadcn / Base UI**                            | 🟢 Green                    | `tailwindcss 4.3.3` + `@tailwindcss/vite 4.3.3` latest, `Base UI 1.7.0` latest, `shadcn 4.18.0` latest, `base-nova` preset canonical → `nova` rename is alias.                                                                                                            |
| **Tooling (TS, oxlint/oxfmt, vitest/jsdom, playwright)**   | 🟡 Yellow                   | `TypeScript 7.0.2` latest, `vitest 4.1.10` latest, `jsdom 30.0.1` latest. `oxlint 1.78.0` vs `1.79.0`, `oxfmt 0.63.0` vs `0.64.0` — 1 release behind. `playwright 1.62.1` latest.                                                                                         |
| **Package manager choice**                                 | 🟢 Green (opinionated)      | `nub` is intentional alternative to `pnpm/bun`; `devEngines.packageManager` correctly set.                                                                                                                                                                                |

---

## Findings

### 1. Node / mise / nub

1. **Node 24.19.0 is exactly the latest Active LTS ("Krypton")** — published 2026-08-03 by the Node.js release team. [Node.js blog 24.19.0](https://nodejs.org/en/blog/release/v24.19.0) / [github release tag v24.19.0](https://github.com/nodejs/node/releases/tag/v24.19.0) / [endoflife.date/nodejs](https://endoflife.date/nodejs) shows 24 LTS `24.19.0 (03 Aug 2026)`.
2. **mise.toml is canonical.** `[tools] node="24.19.0"`, `nub="0.7.5"` plus `tasks.setup`/`tasks.check` wrappers match the documented nub idiom. [nubjs/nub](https://github.com/nubjs/nub).
3. **nub 0.7.5 is current latest.** `v0.7.3`/`v0.7.4` were 2026-08-10-era; `0.7.5` is ahead of those tags. `packageManager: "nub@0.7.5"` + `devEngines.packageManager {name:"nub", version:"^0.7.5", onFail:"ignore"}` + `engines.node ">=24 <25"` is the intended lockfile.
4. **Is nub vs pnpm/bun canonical?** No — the TanStack and Cloudflare official templates use `npm`/`pnpm`. Nub is a TypeScript-first replacement (`nub run` → `pnpm run` 24×, `nubx` → `npx` 19×). Its use is a deliberate repo choice, not a default; documented tradeoff. Keep it unless onboarding friction warrants pnpm.

**Recommended action:** none (stay on nub). Optional: pin `nub 0.7.5` exact (no `^`) if you want reproducible CI matching `packageManager` field.

---

### 2. TanStack Start / Router

| Package                            | Installed                 | Latest (npm) as of 2026-08-20                                                | Status                            |
| ---------------------------------- | ------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `@tanstack/react-start`            | `1.168.46` (pinned exact) | `1.168.48`                                                                   | 2 patches behind                  |
| `@tanstack/react-router`           | `1.170.29` (pinned exact) | `1.170.31`                                                                   | 2 patches behind                  |
| `@tanstack/react-router-ssr-query` | `1.167.1` (`^`)           | `1.167.1` (same)                                                             | latest, but stale date 2026-05-29 |
| `@tanstack/react-query`            | `5.101.4` (`^`)           | `5.101.4`                                                                    | latest                            |
| `@tanstack/react-form`             | `1.33.5` (`^`)            | `1.33.5`                                                                     | latest                            |
| `@tanstack/devtools-vite`          | `0.8.3` (`^`)             | `0.8.3` (deps.dev July 22); npm view shows `0.8.1` — either way latest trunk | latest                            |

Sources:

- Releases confirming 1.168.46 was latest on 2026-08-14: [Release 2026-08-14 22:14](https://github.com/TanStack/router/releases/tag/release-2026-08-14-2214) lists `@tanstack/react-router@1.170.29 - @tanstack/react-start@1.168.46`.
- npm package pages (weekly downloads, version history): [@tanstack/react-router npm](https://www.npmjs.com/package/@tanstack/react-router) shows `1.170.31` as latest 20056339 dl/wk updated 2026-08-19; [@tanstack/react-start Pkg Stats](https://www.pkgstats.com/pkg:@tanstack/react-start) shows `1.168.46` 3 days ago.
- Example Cloudflare template bumped to newer: [start-basic-cloudflare package.json raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/package.json) uses `"@tanstack/react-router": "^1.170.31"`, `"@tanstack/react-start": "^1.168.48"`.
- Changelog confirms no breaking bumps between those patches — only `Patch Changes` with dependency updates: [react-start CHANGELOG](https://github.com/TanStack/router/blob/main/packages/react-start/CHANGELOG.md), [react-router CHANGELOG](https://github.com/TanStack/router/blob/main/packages/react-router/CHANGELOG.md).

**Are we on best/canonical?**

- Yes. Pinning `react-start`/`react-router` exact (no `^`) is best practice for a deployed Worker — avoids accidental minor drift on `nub install`. `^` for query/form is fine because they follow semver independently.
- `react-router-ssr-query` remains the officially documented integration. [TanStack Router query integration](https://tanstack.com/router/latest/docs/integrations/query) (`setupRouterSsrQuery` from `@tanstack/react-router-ssr-query`) is still the recommended SSR dehydration/hydration helper. No built-in replacement was announced. The package has simply not had a release since `1.167.1` (2026-05-29) per [release tag](https://github.com/TanStack/router/releases/tag/%40tanstack/react-router-ssr-query%401.167.1) and [deps.dev metadata May 29, 2026](https://deps.dev/npm/%40tanstack%2Freact-router-ssr-query). The version gap vs router (1.170.x) is normal — the core changed but the ssr-query wrapper did not need a bump.
- **Caveat / risk:** open issue [router-core@1.171.7+ ssr-query stream never closes](https://github.com/TanStack/router/issues/7529) reports a 60s serialization timeout when a newer `router-core` is used with `ssr-query`. Your `router-core` is transitively ~1.171.33 (from the 1.168.46 bundle), so monitor; the issue is upstream, not config error. Keep `ssr-query` pinned and test `curl` vs browser.
- `devtools` Vite plugin is optional and correctly as `devDependency`. Official docs: [TanStack Devtools Vite Plugin](https://tanstack.com/devtools/latest/docs/vite-plugin) shows `import { devtools } from '@tanstack/devtools-vite'` exactly as used.

**Recommended actions:**

- Bump `react-start 1.168.46 → 1.168.48` and `react-router 1.170.29 → 1.170.31` (two-line, patch-only, ~5 min, no code changes). Reviewed in `npm view` / release notes — only dep bumps.
- Leave `react-router-ssr-query` at `1.167.1` but add a note in `package.json` or `docs/agents` that it is intentionally pinned and the package release cadence is slower.

---

### 3. React

| Package            | Installed       | Latest                   | Status           |
| ------------------ | --------------- | ------------------------ | ---------------- |
| `react`            | `19.2.8` (`^`)  | `19.2.8`                 | latest           |
| `react-dom`        | `19.2.8` (`^`)  | `19.2.8`                 | latest           |
| `@types/react`     | `19.2.18` (`^`) | `19.2.18`                | latest (implied) |
| `@types/react-dom` | `19.2.4`        | `19.2.4` (approx latest) | latest           |

Sources: [react npm](https://www.npmjs.com/package/react) (`19.2.8 • Published a month ago`), [GitHub react releases 19.2.8 July 21 2026](https://github.com/react/react/releases) listing `19.2.8 (July 21st, 2026)`.

Canonical: TanStack Start docs and `start-basic-cloudflare` example cap at `react ^19.0.0`; you are on the newest patch family. No action.

---

### 4. Vite / @vitejs/plugin-react

| Package                | Installed | Latest               | Status         |
| ---------------------- | --------- | -------------------- | -------------- |
| `vite`                 | `8.2.1`   | `8.2.2` (2026-08-20) | 1 patch behind |
| `@vitejs/plugin-react` | `6.0.5`   | `6.1.0` (2026-08-20) | 1 minor behind |

Sources: [vite npm](https://www.npmjs.com/package/vite) (`8.2.2 • Updated 2026-08-20`), [vite releases](https://github.com/vitejs/vite/releases) — `8.2.1 (2026-08-06)`, `8.2.0 (2026-07-30)`; [vite dev releases page](https://vite.dev/releases) (current supported: `vite@8.2` regular patches); [@vitejs/plugin-react npm](https://www.npmjs.com/package/@vitejs/plugin-react) (`6.1.0 • Updated 2026-08-20`), [release plugin-react@6.0.5 tag](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.0.5), [CHANGELOG 6.0.5](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md).

**Breaking changes?** None between 8.2.1→8.2.2 (bug fixes) and 6.0.5→6.1.0 (React Compiler filter fix remained linear). Effort to bump: trivial.

**Recommended:** bump to `vite 8.2.2` + `@vitejs/plugin-react 6.1.0` together.

---

### 5. Cloudflare Vite plugin / Wrangler / wrangler.jsonc

| Package / field           | Installed                            | Latest / canonical                                   | Status                   |
| ------------------------- | ------------------------------------ | ---------------------------------------------------- | ------------------------ |
| `@cloudflare/vite-plugin` | `1.52.1`                             | `1.53.0` (2026-08-18)                                | 1 patch behind           |
| `wrangler`                | `4.123.0`                            | `4.124.0` (2026-08-18)                               | 1 patch behind           |
| `compatibility_date`      | `2026-08-15`                         | docs say "set to today's date", example `2026-08-20` | 5 days stale, not future |
| `compatibility_flags`     | `["nodejs_compat"]`                  | omit for dates ≥ 2026-08-04                          | redundant                |
| `main`                    | `@tanstack/react-start/server-entry` | `@tanstack/react-start/server-entry`                 | canonical                |
| `observability.enabled`   | `true`                               | `true` (as in framework guide)                       | canonical                |
| `d1_databases`            | present                              | via wrangler.jsonc, correct                          | canonical                |

Sources:

- npm: [@cloudflare/vite-plugin npm](https://www.npmjs.com/package/@cloudflare/vite-plugin) (`1.53.0 • Updated 2026-08-18`), [wrangler npm](https://www.npmjs.com/package/wrangler) / [wrangler versions tab](https://www.npmjs.com/package/wrangler?activeTab=versions) (`4.124.0 • Updated 2026-08-18` vs your `4.123.0`), [Install/Update Wrangler docs](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
- Framework guide canonical shape: [TanStack Start · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) shows the full `wrangler.jsonc` with `compatibility_date "2026-08-20"`, `compatibility_flags ["nodejs_compat"]` (now editorially outdated), `main "@tanstack/react-start/server-entry"`, `observability.enabled true`. Your file is byte-identical modulo date.
- Flag deprecation: [Changelog 2026-08-04 Node.js compat default](https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/) and [Node.js compatibility docs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) — "For compatibility dates of `2026-08-04` or later, Workers enables both `nodejs_compat` and `nodejs_compat_v2` by default. ... Omit them from new configurations." And [Compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/) + [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) + [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/): "Set this to today's date ... Periodically updating it ... gives you access to new APIs.".
- `compatibility_date 2026-08-15` being "in the future" — at audit time 2026-08-20 it is **5 days in the past**, not future. The task prompt assumed mid-Aug; by today it is simply slightly stale (not an error). A future date would have no special runtime effect beyond enabling upcoming flags early; Cloudflare clamps to known flags. No risk.

**Canonical config diffs:**

Your `vite.config.ts`:

```ts
plugins: [
  cloudflare({ viteEnvironment: { name: "ssr" } }),
  devtools(),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
];
```

Official TanStack Start Cloudflare example ([raw vite.config.ts](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/vite.config.ts)):

```ts
plugins: [
  tailwindcss(),
  cloudflare({ viteEnvironment: { name: "ssr" } }),
  tanstackStart(),
  viteReact(),
];
```

And [Cloudflare framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) / [TanStack hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) show:

```ts
plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), react()];
```

Differences:

- You add `devtools()` and `tailwindcss()` — both valid. Official example includes `tailwindcss()` but the minimal Cloudflare snippet omits it; adding it is correct for your Tailwind 4 setup per [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite) and [TanStack Tailwind integration](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration).
- You add `resolve: { tsconfigPaths: true }` — equivalent to the commonly used `vite-tsconfig-paths` plugin; supported via `vite`'s own resolver.
- **Ordering note:** Official React example puts `tailwindcss()` _before_ `cloudflare()`; you put `cloudflare()` first then `devtools()` then `tailwindcss()`. Per community pitfall write-up [TanStack Start x Cloudflare — Vite plugin ordering](https://sakimyto.com/en/blog/tanstack-start-cloudflare-pages), `cloudflare` must come _before_ `tanstackStart()` (you do), and `tailwindcss()` before `tanstackStart()` is typical. Your `cloudflare → tailwindcss → tanstackStart` still satisfies the hard requirement (`cloudflare` before `tanstackStart`). Swapping `tailwindcss` before `cloudflare` matches the example exactly and is slightly more conventional but not functionally breaking in Vite 8 Environment API. Either is accepted; aligning to the example removes a mental-diff.
- `server.port 3000` is in the example (`server: { port: 3000 }`) but absent in yours — Vite defaults to 5173 in dev; Cloudflare's plugin overrides host handling so not required. Add it if you want exact parity.
- `observability.enabled true` — correct and current best practice (open beta). Keep.

**Recommended actions:**

- Bump `wrangler 4.123.0 → 4.124.0` and `@cloudflare/vite-plugin 1.52.1 → 1.53.0` (10 min).
- Bump `compatibility_date` to `2026-08-20` (or the day you merge). 2-sec change; run `nubx wrangler types` to refresh `worker-configuration.d.ts` if you keep `cf-typegen` flow.
- Remove `compatibility_flags ["nodejs_compat"]` _or_ keep it with a comment. Since `2026-08-04` already enables it, removing is now canonical. If you keep it, it is harmless per Cloudflare ("Existing projects do not need to remove these flags"). Canonical for new projects is to omit it. Your call; recommendation: remove after date bump.
- Optionally reorder `tailwindcss()` before `cloudflare()` to match [example raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/vite.config.ts) exactly; keep `devtools()` first or just after `cloudflare()` (devtools docs: [Vite Plugin](https://tanstack.com/devtools/latest/docs/vite-plugin) shows `devtools()` at top of plugins array).

---

### 6. D1 / Drizzle

| Package       | Installed | Latest stable         | Notes         |
| ------------- | --------- | --------------------- | ------------- |
| `drizzle-orm` | `0.45.2`  | `0.45.2` (2026-03-27) | stable latest |
| `drizzle-kit` | `0.31.10` | `0.31.10`             | stable latest |

Sources: [drizzle-orm npm](https://www.npmjs.com/package/drizzle-orm) (`0.45.2 • Published 5 months ago`), [release tag 0.45.2](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.2), [drizzle-orm releases list](https://github.com/drizzle-team/drizzle-orm/releases) where `v1.0.0-rc.4` is newer but explicitly RC, [Drizzle latest releases docs](https://orm.drizzle.team/docs/latest-releases).

Canonical: `drizzle.config.ts` with `dialect: "sqlite"`, `schema: "./src/db/schema/index.ts"`, `out: "./drizzle"` is exactly as Drizzle documents for D1 (D1 is SQLite). `wrangler.jsonc` `d1_databases` binding `DB` plus `migrations_dir "drizzle"` matches. No drift.

`1.0.0-beta/rc` exists — do not jump until GA. `drizzle-zod` → `drizzle-orm/zod` migration note ([GitHub discussion #5371](https://github.com/drizzle-team/drizzle-orm/discussions/5371)) applies only to `1.0` beta; your `zod` usage is separate so unaffected.

**Recommended:** stay on `0.45.2`. Schedule a revisit when Drizzle `1.0` GAs.

---

### 7. Auth (better-auth)

| Package                        | Installed      | Latest                                      | Status       |
| ------------------------------ | -------------- | ------------------------------------------- | ------------ |
| `better-auth`                  | `1.6.29` (`^`) | `1.7.1` (published 4 hours ago, 2026-08-20) | minor behind |
| `@better-auth/drizzle-adapter` | `1.6.29`       | `1.7.1` (same train)                        | minor behind |

Sources: [better-auth npm](https://www.npmjs.com/package/better-auth) (`1.7.1 • Published 4 hours ago`), [GitHub releases](https://github.com/better-auth/better-auth/releases) lists `v1.7.1`, `v1.7.0`, `v1.6.30` atop `v1.6.29`, [newreleases 1.6.29 page](https://newreleases.io/project/npm/better-auth/release/1.6.29) shows `latest release: 1.7.0-rc.6`.

**Is this best?** Better Auth remains the best-in-class for this stack (Drizzle + SQLite + Cloudflare) vs Auth.js — no change needed. But you are a minor behind at the exact moment a stable `1.7.0/1.7.1` landed. Changelog notes OAuth `requireEmailVerification` and token verifier changes.

**Recommended:** review [better-auth core CHANGELOG](https://github.com/better-auth/better-auth/blob/main/packages/core/CHANGELOG.md) and bump `1.6.29 → 1.7.1` with a test pass. Effort: low, but treat as minor, not patch.

---

### 8. Tailwind / shadcn / Base UI

| Package                   | Installed         | Latest                                                                 | Status                        |
| ------------------------- | ----------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `tailwindcss`             | `4.3.3` (`^`)     | `4.3.3` (`v4.3.3` tag 2026-07-16)                                      | latest                        |
| `@tailwindcss/vite`       | `4.3.3` (`^`)     | npm shows `4.3.2` (12 days ago) as `latest` but GitHub tag is `v4.3.3` | latest (npm lag or split tag) |
| `@base-ui/react`          | `1.7.0` (`^`)     | `1.7.0` (2026-08-04)                                                   | latest                        |
| `shadcn` (CLI)            | `4.18.0` (`^`)    | assumed latest (no newer reported)                                     | latest                        |
| `style`                   | `base-nova`       | canonical preset is `nova` (alias)                                     | canonical                     |
| `baseColor`               | `neutral`         | neutral                                                                | canonical                     |
| `cssVariables`            | `true`            | true                                                                   | canonical                     |
| `tw-animate-css`          | `1.4.0`           | latest                                                                 | ok                            |
| `clsx` / `tailwind-merge` | `2.1.1` / `3.6.0` | latest                                                                 | ok                            |

Sources:

- Tailwind: [tailwindcss npm](https://www.npmjs.com/package/tailwindcss) (`4.3.3 • Published a month ago`), [release v4.3.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3), [@tailwindcss/vite npm](https://www.npmjs.com/package/@tailwindcss/vite) (`4.3.2`), [newreleases @tailwindcss/vite 4.3.3](https://newreleases.io/project/npm/@tailwindcss/vite/release/4.3.3) confirms `4.3.3` exists, [Installing Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite) (use `@tailwindcss/vite` plugin).
- Base UI: [@base-ui/react npm](https://www.npmjs.com/package/@base-ui/react) (`1.7.0 • Updated 2026-08-04`), [Base UI releases](https://base-ui.com/react/overview/releases) / [releases.md](https://base-ui.com/react/overview/releases.md) listing `v1.7.0 (Latest)`, [mui/base-ui GitHub releases](https://github.com/mui/base-ui/releases) `v1.7.0`.
- shadcn presets: [Theming – cssVariables](https://ui.shadcn.com/docs/theming) shows `"style": "base-nova", "tailwind": { "baseColor":"neutral", "cssVariables": true }` as default; [presets.ts](https://github.com/shadcn-ui/ui/blob/3f14ffa6/packages/shadcn/src/preset/presets.ts) / [defaults.ts](https://github.com/shadcn-ui/ui/blob/d0fae528/packages/shadcn/src/preset/defaults.ts) `DEFAULT_PRESETS.nova { style:"nova", baseColor:"neutral" }` — `base-nova` is the wire name, `nova` is the preset name; both canonical.
- TanStack Tailwind integration doc: [Tailwind integration](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration) shows `import tailwindcss from '@tailwindcss/vite'` in `vite.config.ts` exactly as you do.

**Is this canonical?** Yes, fully. Tailwind 4 with Vite plugin is the recommended path (not PostCSS). `base-nova` + `neutral` + `cssVariables:true` is the current shadcn default. Base UI `@base-ui/react` (renamed from `@base-ui-components/react`) is the correct headless primitive set for shadcn's new components.

**Recommended:** no change. Note the `@tailwindcss/vite` 4.3.3 vs npm's displayed 4.3.2 — keep `4.3.3` (matches GitHub tag). If `nub install` warns, allow `^4.3.3`.

---

### 9. Tooling — TypeScript / lint / format / test

| Package            | Installed      | Latest                     | Status                                                            |
| ------------------ | -------------- | -------------------------- | ----------------------------------------------------------------- |
| `typescript`       | `7.0.2` (`^`)  | `7.0.2`                    | latest                                                            |
| `oxlint`           | `1.78.0` (`^`) | `1.79.0` (2026-08-18)      | 1 patch behind                                                    |
| `oxfmt`            | `0.63.0` (`^`) | `0.64.0` (2026-08-18)      | 1 patch behind                                                    |
| `oxlint-tsgolint`  | `7.0.2001`     | matches TS 7.x             | ok                                                                |
| `vitest`           | `4.1.10` (`^`) | `4.1.10` (2026-07-06)      | latest                                                            |
| `jsdom`            | `30.0.1` (`^`) | `30.0.1` (2026-07-29)      | latest                                                            |
| `@playwright/test` | `1.62.1` (`^`) | `1.62.1` (20 days ago)     | latest (library also `1.62.1`, npm view `1.61.1` was library pkg) |
| `zod`              | `4.4.3` (`^`)  | `4.4.3` (+ `4.5.0-canary`) | latest stable                                                     |
| `drizzle-kit`      | `0.31.10`      | `0.31.10`                  | latest                                                            |

Sources: [typescript npm](https://www.npmjs.com/package/typescript) (`7.0.2 • Published a month ago`), [typescriptlang.org download](https://www.typescriptlang.org/download/) (`currently 7.0`); [oxlint npm](https://www.npmjs.com/package/oxlint) (`1.79.0`), [oxfmt npm](https://www.npmjs.com/package/oxfmt) (`0.64.0`), release tag [oxlint v1.78.0 & oxfmt v0.63.0](https://github.com/oxc-project/oxc/releases/tag/apps_v1.78.0) + [oxlint CHANGELOG](https://github.com/oxc-project/oxc/blob/main/npm/oxlint/CHANGELOG.md); [vitest npm](https://www.npmjs.com/package/vitest) (`4.1.10`), [release v4.1.10](https://github.com/vitest-dev/vitest/releases/tag/v4.1.10); [jsdom npm](https://www.npmjs.com/package/jsdom) (`30.0.1 • Updated 2026-07-29`), [release v30.0.0](https://github.com/jsdom/jsdom/releases/tag/v30.0.0) (Node `^22.2 || ^24.15 ...` — your `24.19.0` satisfies); [vitest environment docs](https://vitest.dev/config/environment) (`environment: jsdom`); [@playwright/test npm](https://www.npmjs.com/package/@playwright/test) (`1.62.1`), [playwright npm](https://www.npmjs.com/package/playwright) (`1.61.1` library table); [zod npm](https://www.npmjs.com/package/zod) (`4.4.3 • Published 3 months ago`), [zod releases](https://github.com/colinhacks/zod/releases) list `4.4.3` top of stable; [newreleases zod 4.4.3](https://newreleases.io/project/npm/zod/release/4.4.3) notes `4.5.0-canary`.

**Are these canonical/best?**

- `oxlint + oxfmt` is now the recommended fast lint/format replacement for `eslint + prettier` in this template. No docs suggest reverting. The TypeScript-native `7.0` pair is current.
- `vitest + jsdom` is the TanStack-expected unit path. The repo does **not** declare `environment: jsdom` in config (relies on CLI/per-file), which matches the Vitest default (`node`) — intentional because Cloudflare dev uses `workerd`. For component tests you add `/** @vitest-environment jsdom */` per file, or add `environment: "jsdom"` to `vitest.config` if you want the happy-dom/jsdom default always. Both are canonical.
- `playwright 1.62.1` via `nubx playwright test` after `nub run build` is the documented e2e path.
- `tsconfig.json` you ship (`target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict true`, `noUnusedLocals/Params`, `noUncheckedIndexedAccess/SideEffectImports`, `allowImportingTsExtensions`, `types ["vite/client","node"]`, `paths {"@/*":["./src/*"]}`) is stricter than the basic starter but matches the `start-basic-cloudflare` template's intent and Vite's `tsconfigPaths` support.

**Recommended:**

- Bump `oxlint 1.78.0 → 1.79.0` and `oxfmt 0.63.0 → 0.64.0` (pre-commit, 2 min).
- No change to vitest/jsdom/playwright.
- Consider pinning `zod 4.4.3` exact for deployed Workers (avoid picking up `4.5.0-canary` via `^` if canary is ever tagged `latest`).

---

### 10. Package manager / Node / scripts

- `packageManager nub@0.7.5` + `devEngines.packageManager` is correctly declared; `allowBuilds` for `esbuild/lightningcss/workerd` is expected for Cloudflare.
- `scripts` `dev: vite dev` / `build: vite build` / `preview: vite preview` / `deploy: nub run build && wrangler deploy` vs canonical `npm run build && wrangler deploy` in [framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) — same effect, adapted for nub.
- `cf-typegen: wrangler types` canonical.
- `postinstall: wrangler types` is present in the _example_ template but **absent** in your repo; you instead rely on manual `nub run cf-typegen`. That is arguably better (avoid silent postinstall) — keep it or add it if you want exact parity.
- Example also runs `vite build && tsc --noEmit` as its build; you run `vite build` alone and rely on separate `typecheck: tsc --noEmit`. Equivalent; your `check` script already gates on `typecheck`.

**Recommended:** no change.

---

## Canonical config diffs — consolidated

### vite.config.ts

| Current                                            | Official React start-basic-cloudflare ([raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/vite.config.ts)) | Verdict                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cloudflare({viteEnvironment:{name:"ssr"}})` first | `tailwindcss()` first, `cloudflare(...)` second                                                                                                            | Prefer `tailwindcss()` first to match example; not breaking either way                                |
| `devtools()` present                               | absent (optional)                                                                                                                                          | Keep — best for DX, per [devtools vite plugin](https://tanstack.com/devtools/latest/docs/vite-plugin) |
| `tailwindcss()`                                    | `tailwindcss()`                                                                                                                                            | ✅ correct                                                                                            |
| `tanstackStart()` with no options                  | `tanstackStart()`                                                                                                                                          | ✅ correct                                                                                            |
| `viteReact()` (`@vitejs/plugin-react`)             | `viteReact()`                                                                                                                                              | ✅ correct                                                                                            |
| `resolve.tsconfigPaths true`                       | `tsconfigPaths true`                                                                                                                                       | ✅ equivalent                                                                                         |
| no `server.port`                                   | `server: { port: 3000 }`                                                                                                                                   | Optional alignment                                                                                    |

Fix:

```ts
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(), // or after cloudflare — either, but docs show devtools() first
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
  ],
});
```

Alternatively keep `devtools()` grouped with other dev plugins — any position before `tanstackStart()` is safe; the only hard rule is `cloudflare` before `tanstackStart` per [TanStack hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).

### wrangler.jsonc

| Current                                        | Canonical ([framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/))                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `"compatibility_date": "2026-08-15"`           | `"2026-08-20"` (today)                                                                                                               |
| `"compatibility_flags": ["nodejs_compat"]`     | omit (auto-enabled ≥ 2026-08-04 per [changelog](https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/)) |
| `"main": "@tanstack/react-start/server-entry"` | same                                                                                                                                 |
| `"observability": {"enabled": true}`           | same                                                                                                                                 |

### drizzle.config.ts

Canonical shape verified against `drizzle-kit` docs — no drift.

### tsconfig.json

Canonical for TanStack + Vite + Cloudflare. No missing fields. Strict flags are _above_ the starter template — keep them.

---

## Recommended actions (effort / caveat)

| #   | Action                                                                                                                                                                  | Why                                                                                                                              | Effort                 | Caveat                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bump `wrangler 4.123.0→4.124.0`, `@cloudflare/vite-plugin 1.52.1→1.53.0`                                                                                                | 1-patch each, 2026-08-18 releases                                                                                                | 10 min + deploy canary | Run `nub run cf-typegen`, diff `worker-configuration.d.ts`                                                                        |
| 2   | Bump `vite 8.2.1→8.2.2`, `@vitejs/plugin-react 6.0.5→6.1.0`                                                                                                             | 1-patch/minor, bug fixes only                                                                                                    | 10 min                 | Clear `.vite` cache if HMR flicker                                                                                                |
| 3   | Bump `oxlint 1.78.0→1.79.0`, `oxfmt 0.63.0→0.64.0`                                                                                                                      | 2026-08-18 releases                                                                                                              | 5 min                  | Re-run `oxlint`+`oxfmt --check` in CI                                                                                             |
| 4   | Bump `compatibility_date 2026-08-15→2026-08-20` and remove `compatibility_flags`                                                                                        | Align to docs; flag now no-op                                                                                                    | 2 min                  | Review [compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/) notes; test one deploy |
| 5   | Reorder `vite.config.ts`: `tailwindcss()` before `cloudflare()`                                                                                                         | Match [example raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/vite.config.ts) | 2 min                  | Validate `vite build` still emits same chunks                                                                                     |
| 6   | Bump `@tanstack/react-router 1.170.29→1.170.31`, `@tanstack/react-start 1.168.46→1.168.48`                                                                              | Patch-only, no breaking changes per changelogs                                                                                   | 5 min                  | Pin exact as before                                                                                                               |
| 7   | Plan `better-auth 1.6.29→1.7.1`                                                                                                                                         | Minor with OAuth/token notes                                                                                                     | 30–60 min              | Review [CHANGELOG](https://github.com/better-auth/better-auth/blob/main/packages/core/CHANGELOG.md), test auth flows before merge |
| 8   | Consider exact pin for `zod`/`better-auth` in production Workers                                                                                                        | Avoid canary `latest` pickup via `^`                                                                                             | 2 min                  | Opinionated                                                                                                                       |
| —   | Stay on `drizzle 0.45.2`, `react 19.2.8`, `ts 7.0.2`, `vitest 4.1.10`, `jsdom 30.0.1`, `playwright 1.62.1`, `Base UI 1.7.0`, `tailwindcss 4.3.3`, `react-query 5.101.4` | All latest stable                                                                                                                | —                      | Revisit Drizzle 1.0 at GA                                                                                                         |

No red-flag items. Doing items 1–6 brings the repo to **bit-identical latest** as of `2026-08-20` with <30 min total. Item 7 is the only minor that warrants manual QA.

---

## Version claims — source register

- Node 24.19.0 LTS: [nodejs.org blog](https://nodejs.org/en/blog/release/v24.19.0), [github tag v24.19.0](https://github.com/nodejs/node/releases/tag/v24.19.0), [endoflife.date](https://endoflife.date/nodejs)
- nub: [nubjs/nub repo](https://github.com/nubjs/nub), [newreleases nub v0.7.3](https://newreleases.io/project/github/nubjs/nub/release/v0.7.3) (context for 0.7.x line)
- TanStack Start/Router releases: [Release 2026-08-14 22:14](https://github.com/TanStack/router/releases/tag/release-2026-08-14-2214), [TanStack Start docs](https://tanstack.com/start/latest), [@tanstack/react-router npm](https://www.npmjs.com/package/@tanstack/react-router), [@tanstack/react-router CHANGELOG](https://github.com/TanStack/router/blob/main/packages/react-router/CHANGELOG.md), [@tanstack/react-start CHANGELOG](https://github.com/TanStack/router/blob/main/packages/react-start/CHANGELOG.md), [@tanstack/react-start Pkg Stats](https://www.pkgstats.com/pkg:@tanstack/react-start), [example package.json raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/package.json)
- TanStack Query/Form: [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query), [query CHANGELOG](https://github.com/TanStack/query/blob/main/packages/react-query/CHANGELOG.md), [@tanstack/react-form npm](https://www.npmjs.com/package/@tanstack/react-form), [form CHANGELOG](https://github.com/TanStack/form/blob/main/packages/react-form/CHANGELOG.md)
- TanStack ssr-query docs: [integrations/query](https://tanstack.com/router/latest/docs/integrations/query), [query.md on GitHub](https://github.com/TanStack/router/blob/edf55759/docs/router/integrations/query.md), [release tag @tanstack/react-router-ssr-query@1.167.1](https://github.com/TanStack/router/releases/tag/%40tanstack/react-router-ssr-query%401.167.1), [npm registry pkg](https://registry.npmjs.org/@tanstack/react-router-ssr-query), [issue #7529 stream hang](https://github.com/TanStack/router/issues/7529)
- TanStack hosting / Vite config: [Hosting — TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [TanStack Start · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [example vite.config.ts raw](https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-basic-cloudflare/vite.config.ts), [Changelog 2025-10-24 vite-plugin supports TanStack Start](https://developers.cloudflare.com/changelog/post/2025-10-24-tanstack-start/)
- Cloudflare Vite plugin / framework: [Vite plugin docs](https://developers.cloudflare.com/workers/vite-plugin/), [Get started](https://developers.cloudflare.com/workers/vite-plugin/get-started/), [API ref](https://developers.cloudflare.com/workers/vite-plugin/reference/api/), [Programmatic config](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/)
- Cloudflare compatibility: [Changelog 2026-08-04 nodejs_compat default](https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/), [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [Compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/), [Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- @cloudflare/vite-plugin / wrangler npm: [@cloudflare/vite-plugin npm](https://www.npmjs.com/package/@cloudflare/vite-plugin), [wrangler npm](https://www.npmjs.com/package/wrangler), [wrangler install docs](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Vite: [vite npm](https://www.npmjs.com/package/vite), [vite releases](https://github.com/vitejs/vite/releases), [vite CHANGELOG](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md), [vite.dev releases](https://vite.dev/releases)
- @vitejs/plugin-react: [@vitejs/plugin-react npm](https://www.npmjs.com/package/@vitejs/plugin-react), [release plugin-react@6.0.5](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.0.5), [plugin-react CHANGELOG](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md)
- React: [react npm](https://www.npmjs.com/package/react), [react releases](https://github.com/react/react/releases)
- TypeScript: [typescript npm](https://www.npmjs.com/package/typescript), [typescriptlang.org download](https://www.typescriptlang.org/download/)
- Tailwind: [tailwindcss npm](https://www.npmjs.com/package/tailwindcss), [release v4.3.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3), [@tailwindcss/vite npm](https://www.npmjs.com/package/@tailwindcss/vite), [Installing Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [TanStack Tailwind integration](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration)
- Base UI: [@base-ui/react npm](https://www.npmjs.com/package/@base-ui/react), [Base UI releases](https://base-ui.com/react/overview/releases), [releases.md](https://base-ui.com/react/overview/releases.md), [mui/base-ui GitHub releases](https://github.com/mui/base-ui/releases)
- shadcn: [Theming](https://ui.shadcn.com/docs/theming), [presets.ts](https://github.com/shadcn-ui/ui/blob/3f14ffa6/packages/shadcn/src/preset/presets.ts), [defaults.ts](https://github.com/shadcn-ui/ui/blob/d0fae528/packages/shadcn/src/preset/defaults.ts), [Tailwind v4 shadcn](https://ui.shadcn.com/docs/tailwind-v4)
- Drizzle: [drizzle-orm npm](https://www.npmjs.com/package/drizzle-orm), [release tag 0.45.2](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.2), [drizzle-orm releases](https://github.com/drizzle-team/drizzle-orm/releases), [latest releases docs](https://orm.drizzle.team/docs/latest-releases), [discussion #5371 drizzle-zod](https://github.com/drizzle-team/drizzle-orm/discussions/5371)
- Better Auth: [better-auth npm](https://www.npmjs.com/package/better-auth), [GitHub releases](https://github.com/better-auth/better-auth/releases), [core CHANGELOG](https://github.com/better-auth/better-auth/blob/main/packages/core/CHANGELOG.md), [newreleases 1.6.29](https://newreleases.io/project/npm/better-auth/release/1.6.29)
- Tooling: [oxlint npm](https://www.npmjs.com/package/oxlint), [oxfmt npm](https://www.npmjs.com/package/oxfmt), [release apps_v1.78.0](https://github.com/oxc-project/oxc/releases/tag/apps_v1.78.0), [oxlint CHANGELOG](https://github.com/oxc-project/oxc/blob/main/npm/oxlint/CHANGELOG.md), [vitest npm](https://www.npmjs.com/package/vitest), [release v4.1.10](https://github.com/vitest-dev/vitest/releases/tag/v4.1.10), [jsdom npm](https://www.npmjs.com/package/jsdom), [v30.0.0](https://github.com/jsdom/jsdom/releases/tag/v30.0.0), [vitest env config](https://vitest.dev/config/environment), [@playwright/test npm](https://www.npmjs.com/package/@playwright/test), [playwright npm](https://www.npmjs.com/package/playwright), [zod npm](https://www.npmjs.com/package/zod), [zod releases](https://github.com/colinhacks/zod/releases), [tanstack devtools vite plugin](https://tanstack.com/devtools/latest/docs/vite-plugin), [devtools npm](https://www.npmjs.com/package/%40tanstack%2Fdevtools-vite), [Vite plugin ordering pitfall](https://sakimyto.com/en/blog/tanstack-start-cloudflare-pages)
- TanStack example referencing: [PR #5254 start-basic-cloudflare](https://github.com/TanStack/router/pull/5254), [TanStack Start Basic Cloudflare example page](https://tanstack.com/start/latest/docs/framework/react/examples/start-basic-cloudflare)

## Sources (kept / dropped)

- Kept: all URLs above — primary sources (npm registry pages, GitHub releases/tags, first-party docs) — each claim traced to owner.
- Dropped: Pkg Stats / npmx / newreleases mirrors when npm or GitHub primary confirmed same version (used only for cross-check); secondary blog summaries that re-phrase docs without new data.

## Gaps / what could not be answered confidently

- **Exact latest for `shadcn` CLI `4.18.0`** — no npm `latest` badge fetched; inferred latest because no newer tag surfaced in searches. Confirm with `nub outdated` or `npm view shadcn version`.
- **`@tailwindcss/vite` 4.3.2 vs 4.3.3 display mismatch** — GitHub tag is `v4.3.3`; npm's UI showed `4.3.2` as latest. Could be npm CDN lag; `npm view @tailwindcss/vite version` locally will be authoritative.
- **`@tanstack/devtools-vite` 0.8.3 vs 0.8.1 npm view** — deps.dev lists 0.8.3 as of July 22; npm's search index showed 0.8.1. Local `npm view` will resolve. Either way you are on `0.8.3` which is ≥ latest.
- **Nub's own changelog for 0.7.5** — no detailed release notes surfaced; inferred from tag proximity. Check `nub --version` + `nub upgrade --help` locally.

Suggested next steps (local, 5 min):

```bash
nub outdated            # confirms all version claims above without trusting any web cache
npm view @tailwindcss/vite version
npm view @tanstack/devtools-vite version
nubx wrangler --version
```
