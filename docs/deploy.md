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

This repo develops with `prisma db push` and has **no migration history**. For a
clean prod deploy, generate an initial migration once and apply it:

```sh
# against a throwaway/empty DB, generate the baseline migration:
DATABASE_URL="postgres://…empty…" npx prisma migrate dev --name init
git add prisma/migrations && git commit -m "chore(db): baseline migration"

# then, against Neon:
DATABASE_URL="<neon-pooled-url>" npx prisma migrate deploy
```

Quick alternative for a brand-new empty Neon DB (no data to lose):
`DATABASE_URL="<neon-url>" npx prisma db push`. Never run `db push` against a
Neon DB that already holds real data — use `migrate deploy`.

Optionally seed a demo org/price book: `DATABASE_URL="<neon-url>" pnpm db:seed`
(remove the demo credentials from `prisma/seed.ts` before seeding a real env).

## 3. Environment variables (host project settings)

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | the deployed origin, e.g. `https://app.example.com` |
| `NODE_ENV` | `production` (set by the host) |

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
