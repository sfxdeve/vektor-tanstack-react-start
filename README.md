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
nubx --yes shadcn@latest add button --yes
```

## Porting reference & asset policy

The old VEKTOR codebase at `~/Developer/VEKTOR` (FastAPI `backend/`, CRA `frontend/`, `design_guidelines.json`, `logo_exports/`) is the functional spec for this port. Looking up layout, copy, validation rules, and component structure in the old repo (`frontend/src/pages`, `src/components`, `src/App.js`, `backend/routes`, `design_guidelines.json` `image_urls`) while porting is **allowed and encouraged**. Copy required assets (fonts via Fontshare/Google, `logo_exports/` logos, `frontend/public/logo`, `help-slides/`, `partners/`, blueprint image from `design_guidelines.json`) into `public/` when needed — do not hotlink Pexels in production.

## Design system

Swiss high-contrast, Zinc neutrals (`#F4F4F5` background / `#FFFFFF` surface / `#09090B` primary / `#71717A` secondary — darkened to `#52525B` for WCAG 2AA on `#F4F4F5` / `#E4E4E7` border), status `#DC2626` / `#D97706` / `#16A34A` / `#2563EB`, `Cabinet Grotesk` headings (tracking-tight, `text-5xl` max) + `IBM Plex Sans` body, high-density grid `grid-cols-1 md:grid-cols-3 lg:grid-cols-4`, generous `p-6`/`p-8`, grid borders `border-r border-b`, sharp `rounded-sm` (4px), flat 1px cards with `-translate-y-1` + `shadow-sm` hover, sonner bottom-right.
