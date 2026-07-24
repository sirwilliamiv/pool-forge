# Pool Forge

Draw the pool. Price the job. Export the proposal.

A modern pool design, estimating, and proposal platform that replaces the Visio + PoolDraw + Excel workflow with a single Figma-style 2D canvas tied to a live pricing engine.

## Prerequisites

- **Node** 20+ (see `.nvmrc`)
- **pnpm** 10+
- **Docker** (for local Postgres)

## First-time setup

```sh
cp .env.example .env.local
# fill in AUTH_SECRET — generate one with:
#   openssl rand -base64 32

pnpm install
pnpm db:up                 # starts Postgres in Docker
pnpm db:push               # syncs schema to local DB
pnpm db:seed               # inserts demo org, user, project, price book
pnpm dev                   # → http://localhost:3000
```

Demo credentials (after `pnpm db:seed`):

| Email | Password |
|---|---|
| `demo@poolforge.test` | `demo1234` |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Start the Next.js dev server on :3000 |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | `tsc --noEmit` (strict mode) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm db:up` | Start local Postgres in Docker |
| `pnpm db:down` | Stop local Postgres |
| `pnpm db:push` | Sync `prisma/schema.prisma` to the DB without migrations |
| `pnpm db:seed` | Run `prisma/seed.ts` |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm electron:dev` | Run the app as a desktop window (boots Next dev + Electron) |
| `pnpm electron:pack` | Package the desktop app into `dist-electron/` (no installer) |
| `pnpm electron:build` | Build signed `.dmg` (macOS) and `.exe` (Windows) installers |

## Desktop app

`pnpm electron:dev` opens the app in a native window pointed at the local
Next.js dev server. The Electron main process is `electron/main.cjs`;
electron-builder config lives in `electron-builder.yml`.

For packaged builds, `pnpm electron:pack` produces an unsigned bundle in
`dist-electron/`. Postgres is still required at runtime — distribute the
desktop app to teams who already run the Docker stack, or swap to the
embedded SQLite story before shipping to end users. Code-signing
(macOS notarization, Windows EV cert) lives outside the dev-loop scripts.

## Architecture

The app is **command-registry-first**: every user-driven action — toolbar buttons, keyboard shortcuts, and the future voice agent — dispatches through a single typed command registry in `src/modules/commands/`. This keeps automation, hotkeys, macros, and voice on the same code path as the UI.

The scene is a single three.js / react-three-fiber canvas — the "2D plan view" is the same scene under an orthographic camera, not a separate 2D renderer (there is no Konva). Shape state in `src/modules/editor/state/` is the source of truth for geometry; 1 unit = 1 inch. The measurement engine derives area, perimeter, gallons, deck area, and feature counts from those shapes; the pricing engine consumes those measurements plus a versioned price book to produce a live quote; the validation engine gates exports.

See [`docs/architecture.md`](docs/architecture.md) for a full walkthrough and [`docs/build-priority.md`](docs/build-priority.md) for the active roadmap.
