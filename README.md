# Vektor

A TanStack Start application for Cloudflare Workers.

## Setup

```bash
mise install
mise run setup
nub run dev
```

## Commands

- `nub run dev` starts the Vite development server.
- `nub run build` creates the Cloudflare Workers build.
- `nub run preview` previews the production build.
- `nub run deploy` builds and deploys to Cloudflare Workers.
- `nub run deploy:preview` uploads a Cloudflare preview version.
- `nub run cf-typegen` generates Cloudflare runtime and binding types.
- `nub run check` runs type checking, linting, formatting, unit tests, e2e tests, and the build.
- `nub run clean` removes generated output.

The scaffold uses shadcn/ui with Base UI primitives and the `base-nova` preset. Add components with:

```bash
nubx shadcn add button
```
