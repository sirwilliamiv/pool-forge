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
