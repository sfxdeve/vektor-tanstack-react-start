# VEKTOR Cutover Runbook — TanStack Start → Cloudflare Workers

Big-bang production cutover for the one-go port. Fresh start: no MongoDB /
Emergent Object Storage data migration, no password-hash porting. The old
FastAPI app at `~/Developer/VEKTOR` stays warm **only as a rollback DNS
target** — there is deliberately no data sync between old and new.

Every command runs from the repo root unless stated otherwise.

---

## 0. Preconditions

- [ ] `wrangler login` done (`nubx wrangler whoami` shows the operator account)
- [ ] Cloudflare account has Workers + D1 enabled; account ID matches
      `56d7e2012aeb6795f186c2d3453504b6` (or update `database_id` in
      `wrangler.jsonc` if the account differs)
- [ ] **R2 enabled on the account** (Dashboard → R2 → Enable). Without this,
      `wrangler r2 bucket list` fails with code 10042 and the STORAGE binding
      cannot be created. _(As of 2026-08-21 this was still pending on the
      operator account.)_
- [ ] Local gate green: `nub run check` passes (typecheck, oxlint, oxfmt,
      unit, e2e, build)

## 1. Database migrations (remote D1)

```bash
# Regenerate to prove zero schema drift; expect "No changes detected"
nub run db:generate

# Apply pending migrations to remote D1 (idempotent — applied ones are skipped)
nubx wrangler d1 migrations apply DB --remote
```

Verify:

```bash
nubx wrangler d1 migrations list DB --remote   # "Migrations to be applied" must be empty
```

## 2. R2 bucket

If not present yet:

```bash
nubx wrangler r2 bucket create vektor-storage
nubx wrangler r2 bucket list        # vektor-storage listed
```

The bucket stays private — all access flows through authenticated Worker
handlers (`env.STORAGE.put/get/delete`). No public serving, no presigned-URL
shim.

## 3. Secrets and vars

Secrets (values are operator-held; prompts hide input):

```bash
nubx wrangler secret put BETTER_AUTH_SECRET    # openssl rand -base64 32
nubx wrangler secret put RESEND_API_KEY        # re_... from Resend dashboard
nubx wrangler secret put OPENAI_API_KEY        # sk-...
nubx wrangler secret put AI_GATEWAY_ID         # optional; AI Gateway id if used
nubx wrangler secret put EFT_BANK_NAME         # First National Bank
nubx wrangler secret put EFT_ACCOUNT_HOLDER    # legal entity on the account
nubx wrangler secret put EFT_ACCOUNT_NUMBER
nubx wrangler secret put EFT_BRANCH_CODE       # FNB 250655
nubx wrangler secret put EFT_ACCOUNT_TYPE      # Cheque
```

Plain vars (non-secret) are passed with `--var` at upload/deploy time so the
same build works across environments:

```bash
PROD_URL="https://vektorhq.co.za"     # final production origin
VARS="--var APP_URL=$PROD_URL --var BETTER_AUTH_URL=$PROD_URL"
```

`DEV_AI_STUB`, `DEV_MAILBOX`, `DEV_*` must **never** be set in production.
They exist only in `.dev.vars` (local/e2e) or as explicit preview-upload vars.

## 4. Seed the first admin (after first deploy)

better-auth has no OAuth; email+password only. Create the operator account and
promote it:

```bash
curl -X POST "$PROD_URL/api/auth/sign-up/email" \
  -H "content-type: application/json" \
  -H "Origin: $PROD_URL" \
  -d '{"email":"<admin@example.com>","password":"<long passphrase>","name":"Vektor Admin"}'

nubx wrangler d1 execute DB --remote \
  --command "UPDATE user SET role='admin' WHERE email='<admin@example.com>'"
```

Log out/in once afterwards so the session picks up the admin role. Keep these
credentials — the smoke journey consumes them as
`SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`.

## 5. Preview upload + reproducible smoke

```bash
nub run build
nubx wrangler versions upload $VARS --var DEV_AI_STUB=1
# note the printed preview URL, e.g. https://<version>-vektor-tanstack-react-start.<subdomain>.workers.dev
```

Run the automated vertical-chain smoke against the preview URL (deterministic
AI via DEV_AI_STUB; reminder sweep runs against real Resend using the stored
secret — sends go to throwaway example.com addresses and sent_reminders rows
prove idempotency):

```bash
E2E_BASEURL=https://<preview-url>.workers.dev \
SMOKE_ADMIN_EMAIL=<admin@example.com> \
SMOKE_ADMIN_PASSWORD=<passphrase> \
nubx playwright test tests/e2e/smoke.spec.ts --project=chromium
```

Then a manual pass over the chain in the browser: signup with `?ref=` link,
company setup validation deep-links, document vault expiry warning, tender
analyze, SBD downloads open in a PDF viewer, EFT proof viewable by admin,
dashboard activity filter, help slides render.

## 6. Production deploy

```bash
nub run deploy        # = nub run build && wrangler deploy ($VARS included manually if needed)
```

Post-deploy verification:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<workers-url>/            # 200 landing
curl -s -o /dev/null -w "%{http_code}\n" https://<workers-url>/api/reference/bargaining-councils  # 200 JSON
nubx wrangler deployments list | head                                      # new deployment active
```

Cron is registered automatically from `wrangler.jsonc`
(`crons: ["0 6 * * *"]` — 06:00 UTC = 08:00 SAST; see §8 note).

## 7. DNS switch and rollback

1. Switch DNS for the production domain to the Workers route/custom domain.
2. Verify landing + login + one full tender analysis through the live domain.
3. **Rollback** = flip DNS back to the old `~/Developer/VEKTOR` deployment
   (kept warm, untouched). There is **no data sync**: any signups/payments made
   on the new stack after cutover do not exist in the old system. Reverting
   therefore loses post-cutover data by design — treat rollback as an
   emergency stop, not a feature toggle.

## 8. Known operational notes

- **Worker entry** is `worker.ts`: it re-exports the TanStack Start fetch
  handler as the default export and adds the `scheduled` cron handler that
  runs the Compliance Guardian sweep. No build-time patching involved.
- **PDF extraction** uses `unpdf` (serverless pdf.js) in the Worker; the e2e
  fixtures under `tests/fixtures/` are real pdf-lib documents so the
  extraction path is exercised end to end.
- **No `/payment/success` or `/payment/cancel` routes**: those belonged to the
  deleted Stripe hosted-checkout flow. With EFT the post-payment surface is the
  billing page's request status (reference → awaiting_proof → pending_review →
  confirmed/rejected), which covers the same user need without a redirect page.

- Cron schedule is `0 6 * * *` in UTC = 08:00 SAST, matching the spec's
  "daily reminders at 08:00 SAST" (Cloudflare cron triggers run in UTC).
- Reminder idempotency lives in D1 (`sent_reminders` per company+document+
  threshold); re-running sweeps never double-sends.
- `/api/dev/*` endpoints are hard-gated: they answer only when a DEV flag is
  set or the request is loopback-local. They are absent in production traffic.
- Local e2e needs `.dev.vars` — `scripts/ensure-dev-vars.mjs` (run by
  `preflight`, wired into `check`/`test:e2e`) creates it from the checked-in
  example when missing. Never commit real secrets there.
