# Deploying Pool Forge (web) to the cloud

Current state: local-first — Postgres in Docker (`pnpm db:up`) and `next dev`.
This runbook takes the **web app** to a Node host (Vercel is assumed; any Node
host works) backed by **Neon Postgres**. The Electron desktop build is separate
(`pnpm electron:build`) and is not covered here.

Everything below needs accounts and secrets only the owner has (Neon project,
host project, `AUTH_SECRET`). The code is ready; these are the operator steps.

## 1. Provision Neon

1. Create a Neon project → copy the **pooled** connection string
   (`...-pooler.<region>.aws.neon.tech/...?sslmode=require`).
2. That string is your production `DATABASE_URL`.

No code change is required for a Node runtime: the standard `PrismaClient` in
`src/lib/db.ts` speaks the Postgres wire protocol to Neon directly. The
`@prisma/adapter-neon` driver adapter is only needed for the **edge** runtime;
this app runs Node server actions, so skip it.

## 2. Create the production schema on Neon

This section used to say the repo had no migration history. That has not been
true since the `0_init` baseline landed: `prisma/migrations/` now holds 13
migrations, starting at `0_init` and running through
`20260827211543_beta_readiness_foundations`. There is nothing to generate.

```sh
DATABASE_URL="<neon-pooled-url>" npx prisma migrate deploy
DATABASE_URL="<neon-pooled-url>" npx prisma migrate status   # expect "up to date"
```

`migrate deploy` applies only what is missing and never prompts, which is what
makes it the deploy-time command. Do not run `prisma migrate dev` against a
deployed database: it is the development command and will offer to reset.

**Never run `prisma db push` against a database that holds real data.** It
diffs the schema straight onto the database with no migration record, so the
next `migrate deploy` sees a schema it cannot account for. `db push` is for the
local development database only.

Take a dump before every `migrate deploy` (`pnpm db:backup`, one command, a few
hundred KB today). A migration is the single most likely way to lose data, and
it is the one where a backup taken sixty seconds earlier costs nothing. See
[docs/backup-restore.md](./backup-restore.md).

Optionally seed a demo org/price book on a brand-new database:
`DATABASE_URL="<neon-url>" pnpm db:seed` (remove the demo credentials from
`prisma/seed.ts` before seeding a real environment).

## 3. Environment variables (host project settings)

| Var | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `AUTH_URL` | yes | the deployed origin, e.g. `https://app.example.com` |
| `NODE_ENV` | set by host | `production` |
| `MONITORING_ENV` | no | deployment label in logs and alerts, e.g. `beta`. Defaults to `NODE_ENV` |
| `MONITORING_RELEASE` | no | build identifier, usually the git sha |
| `MONITORING_ALERT_WEBHOOK_URL` | no | https endpoint that accepts a JSON POST. Empty disables alerting |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `PG_IMAGE` | no | only read by the backup scripts, not by the app |

**Error monitoring needs none of these to work.** With nothing set, every
server error and every browser error boundary still produces one redacted JSON
line on stderr. See §6.

There are no `NEXT_PUBLIC_*` build-time vars in the web app today; if any are
added later, set them in the host's **build** environment (they bake at build).

## 4. Build and deploy

```sh
pnpm install
pnpm db:generate      # prisma generate (also runs in the host build)
pnpm build            # next build
```

On Vercel: import the repo, set the env vars above, and it runs `next build`.
The `postinstall`/build must run `prisma generate` (it does, via `db:generate`
or a build hook) so the client matches the schema.

## 5. Post-deploy smoke test

- `GET /` → `/login` (auth gate works).
- Sign in, create a project, open `/settings/company`, set a tax rate + brand.
- Open a project's proposal, create a share link, open `/share/<token>` in a
  private window (no login) and accept it.

## 6. Error monitoring

### What was chosen, and why it is not Sentry

**Structured JSON on stderr, plus an optional webhook.** No vendor SDK, no
account, no DSN, no source-map upload token, no client bundle cost.

Sentry is the obvious answer for a Next.js app and it was the starting
assumption. It was rejected for this stage on three grounds:

1. **It cannot run unconfigured.** The requirement is that the app runs and the
   suite passes with no monitoring set up at all. A vendor SDK bolted into
   `next.config.ts` via `withSentryConfig` is present in every build whether or
   not a DSN exists, and it needs an account and a secret that only the owner
   can create before it does anything.
2. **Its default value is customer data.** Sentry's worth comes from breadcrumbs,
   request context, session replay and automatic capture of the values in scope.
   For Pool Forge those are homeowners' names, addresses, phone numbers and
   contract totals. Making it safe means denying almost all of it in
   `beforeSend`/`beforeBreadcrumb`, at which point you have paid the bundle, the
   build integration and the vendor relationship for a scrubbed skeleton.
3. **Nothing needs it yet.** One instance, one operator, and a host that already
   aggregates stdout. Alerting was the only real gap, and one webhook closes it.

The trade is explicit: no error grouping UI, no release health, no trend graphs,
no retention beyond the host's log window. `fingerprint` is on every record so
grouping is a `sort | uniq -c` rather than nothing. If the beta grows past one
operator, the seam to swap is `captureError` in
`src/modules/monitoring/report.ts` — a single function, already the only place
an error becomes a record.

### How it works

| Piece | File |
|---|---|
| Server errors (pages, route handlers, server actions) | `src/instrumentation.ts` → `onRequestError` |
| Browser errors | `src/app/error.tsx`, `src/app/global-error.tsx` |
| Where browser errors are sent | `POST /api/monitoring/report` (first party, unauthenticated, rate limited) |
| Redaction | `src/modules/monitoring/redact.ts` |
| Record and sink | `src/modules/monitoring/report.ts` |

Every capture writes one JSON line to stderr:

```json
{"scope":"monitoring","event":"error","errorRef":"err_1a2b3c4d5e6f","severity":"error",
 "origin":"server","code":"server_render","route":"/projects/:id/quote","name":"TypeError",
 "message":"Cannot read properties of undefined","digest":"3299871266",
 "fingerprint":"5f2a91c0","stack":["..."],"orgId":"clx…","userId":"clx…",
 "environment":"beta","release":"a1b2c3d","at":"2026-08-28T01:41:27.000Z"}
```

`errorRef` is the `err_<12 hex>` format the imports, intake and voice paths
already show users, so there is one thing to ask a builder for and one grep:

```sh
# the builder read "err_1a2b3c4d5e6f" off their screen
vercel logs --since 24h | grep err_1a2b3c4d5e6f
gcloud logging read 'textPayload:"err_1a2b3c4d5e6f"' --limit 20
```

`digest` is the join between the two halves. Next computes it for a server
error, passes it to `onRequestError` **and** to the browser error boundary, so
the server-side cause and the browser-side report carry the same value even
though they have different refs. Grep the digest to get both.

### The privacy rule

Nothing reaches a log line or a webhook without passing `redactText`, which
removes credential material, email addresses, IP addresses, money figures, long
digit runs, telephone shapes, home-directory paths, quoted phrases and
capitalised proper nouns, and caps the result. `src/test/unit/monitoring/
redact.test.ts` feeds it a realistic Prisma failure carrying a customer's name,
their email address, their street address, their phone number and a $48,750
contract total, and asserts none of them survives anywhere in the record or in
the webhook payload. The stack is logged locally and never sent outbound.

### What this does not cover

Next.js prints its own uncaught server errors to stderr, unredacted, before
`onRequestError` ever runs. Verified by throwing a route handler carrying a
customer name, an email address and a `$48,750` total: the monitoring record was
clean in every field, and Next's own line above it was not.

That is the host's log, not a third party, and it is where the app's output
already goes, so it does not breach the rule this design exists to hold: the
outbound webhook only ever carries the redacted record. But it does mean the
log stream is not itself safe to paste into a ticket or forward to a vendor.
Two consequences worth acting on:

- Keep log retention short and access to the log console restricted.
- When quoting an error to anybody, quote the `err_…` reference and the
  `{"scope":"monitoring"}` line, never the raw stack above it.

The way to actually close this is for application code never to put customer
values into an error message in the first place, which is the convention the
`imports`, `intake` and `voice` modules already follow (canned copy plus a ref).
Monitoring is the second line of defence, not the first.

### Turning alerting on

Set `MONITORING_ALERT_WEBHOOK_URL` to any https endpoint that accepts a JSON
POST (a Slack or Discord incoming webhook is the cheapest option). It is
fire-and-forget with a 3 s timeout and 15-minute per-fingerprint deduplication,
so a dead sink or an error storm cannot slow or break a request. Leave it empty
and alerting is simply off.

Check it is on from the logs rather than from memory — the app writes one line
at boot:

```json
{"scope":"monitoring","event":"ready","sink":"stdout","alerts":"webhook","environment":"beta","release":"a1b2c3d"}
```

### Verifying after deploy

```sh
curl -si -X POST "$APP_URL/api/monitoring/report" \
  -H 'content-type: application/json' \
  -d '{"code":"deploy_smoke","name":"Error","message":"monitoring smoke test"}'
# → 202 with {"ok":true,"errorRef":"err_…"}; that ref must appear in the logs
```

## 7. Backups

There is a runbook with a real, executed restore drill in
[docs/backup-restore.md](./backup-restore.md). The short version:

```sh
pnpm backup              # database dump then blob archive, in that order
pnpm db:verify-restore   # restore into a scratch DB and compare every row count
```

Take a dump before every `migrate deploy`. Schedule `scripts/backup-all.sh`
daily, copy the output off the machine, and alert if the job stops running. On
Neon, also set the history window to at least 7 days and prefer restoring into a
branch; provider history protects against your mistakes, the dumps protect
against losing the provider.

## Notes

- Cloud Run / Fly / Render also work — anything that runs a Node server and can
  reach Neon. The only host-specific piece is where the env vars live.
- Keep local dev on Docker Postgres; production simply points `DATABASE_URL` at
  Neon. No `db.ts` change is needed for the Node runtime.
- The prod cutover reminders in `CLAUDE.md` still apply (no `db push` on a
  populated prod DB; use `migrate deploy`).

## Vertex AI for image ingestion

Wave I sends customer photographs to a vision model. Per the global rule this
uses **Vertex AI only**: the consumer `generativelanguage.googleapis.com`
endpoint permits Google to use prompts for training, and these are pictures of
customers' homes.

### Project

Pool Forge runs Vertex in **`pool-forge-prod`** (project number 764613501658),
`us-central1`, with `aiplatform` and `storage` enabled and a
`pool-forge-vertex@` service account holding `roles/aiplatform.user` for the
eventual Cloud Run deploy.

Getting it billed required freeing a slot: billing account
`0161A7-61F9DB-ED6CCC` caps at 5 linked projects, the second account
(`010C1D-0603E3-C1CE17`) is closed, and the project-link limit is not exposed
through the quota API, so it is a support form or nothing. On 2026-08-19
`hire-billy-prod` was unlinked to make room, chosen because it ran no Cloud Run
service, no SQL, no GCE, and no secrets; it held only Cloud Build logs and one
Artifact Registry image from a single 2026-08-03 build, all reproducible from
source. Note that disabling billing eventually causes Google to reclaim those
artifacts.

This is a swap, not spare capacity: relinking `hire-billy-prod` means unlinking
something else, unless the quota is raised at
https://support.google.com/code/contact/billing_quota_increase

### Credentials

Application Default Credentials, no key files in the repo.

```
gcloud auth application-default login
gcloud auth application-default set-quota-project gss-demo-dev
```

This is interactive, so it cannot be scripted in CI. In deployment the runtime
service account supplies ADC instead, and needs `roles/aiplatform.user` on the
project named by `GCP_PROJECT_ID`.

**Restart the server after re-authing.** The Google auth library reads ADC once
and caches the credential in memory, so a running `pnpm dev` keeps presenting
the expired one and every call fails with `invalid_grant` / `invalid_rapt` long
after `gcloud auth application-default login` has succeeded. The shell will say
the token is fine while the app keeps failing. Restart the process.

Confirm before enabling live mode:

```
gcloud auth application-default print-access-token >/dev/null && echo ok
```

A stale `~/.config/gcloud/application_default_credentials.json` still exists on
disk after its refresh token expires, so presence of the file proves nothing.
Check the token, not the file.

### Turning it on

`VERTEX_LIVE="1"` in `.env.local`. While it is `0` (or unset) the vision client
is disabled, `installVertexVisionPort()` declines to bind, the analysis port
stays the no-op, and the Google SDK is never loaded. Every test replays recorded
fixtures regardless.

### Measured behaviour (live, 2026-08-19)

Verified end to end through the running app: a graph-paper sketch uploaded via
the public intake funnel produced a measured design.

| Signal | Value |
|---|---|
| `gemini-2.5-pro` sketch extraction | 41 to 46 s, ~5,000 in / ~750 out tokens |
| Scale resolved by | `grid`, from the graph paper itself |
| Ground truth | 20 px per square at 1 sq = 1 ft, so 1.66667 px/inch |
| Measured | 1.665585 px/inch, **0.065% error** |
| Extracted | 32 ft x 16 ft, depths 3.5 / 6, spa, paver deck, 8-point footprint |

`VERTEX_TIMEOUT_MS` is 180s rather than 60s because of this: a 46 s call under a
60 s ceiling returned `504 DEADLINE_EXCEEDED` on all three attempts, while the
identical call succeeded when run directly. The retry path worked correctly and
still could not save it, because every attempt hit the same wall.

### iPhone HEIC

sharp's bundled libvips includes AV1 but not HEVC, so an iPhone HEIC opens far
enough to report its dimensions and then fails on the pixels. `metadata()`
succeeding proves nothing, which is the trap: a decodability check written that
way passes and the failure surfaces later.

Since a phone photo of a sketch is the most common thing a customer sends,
those files decode through `libheif-js` (libheif plus libde265 compiled to
wasm) rather than being refused with "export it as JPEG". It is lazily imported
so the JPEG and PNG paths never load the wasm, and it is listed in
`serverExternalPackages`. libheif applies EXIF orientation itself, so that path
must not also call sharp's `.rotate()`, and raw RGBA carries no tags at all, so
the metadata strip is inherent rather than a step to remember.

### Cost control

Classification runs on `gemini-2.5-flash`, extraction on `gemini-2.5-pro`.
Images are downscaled to 1568px on the long edge before any call, and results
cache on `(sourceImageId, stage, extractorVersion)`, so re-analysis at an
unchanged prompt version costs nothing.
