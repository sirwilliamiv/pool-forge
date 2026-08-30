# Pool Forge — repo conventions for Claude

These conventions override default behavior when working in this repo.

## Command-registry-first

Every user-driven action — toolbar buttons, keyboard shortcuts, server actions, and the future voice agent — must dispatch through `src/modules/commands/`. Do not bypass the registry by calling Prisma or domain modules directly from a UI event handler. If you need a new action, register a new command first.

UI buttons, hotkeys, and voice utterances are all thin shells over the same `EditorCommand.execute()` call. This is non-negotiable: it's the architectural backbone that keeps automation working without a rewrite.

## Strict TypeScript

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Two consequences worth remembering:

- **Don't spread optional params directly.** `{ ...{ field: undefined } }` writes the key as `undefined`, which violates `exactOptionalPropertyTypes`. Build a typed intermediate object and conditionally assign each optional field.
- **Indexed access is `T | undefined`.** Treat `arr[i]`, `record[key]` as possibly missing — narrow before use.

## Zod at every boundary

Every API route, server action, and command must validate its input with Zod (`src/lib/zod/` or co-located). No untyped JSON body parsing. Output schemas are also defined for commands so the registry can enforce response shape.

## Audit log for every command

Every command execution writes a row to `CommandAuditLog` regardless of success or failure. The audit log is the source of truth for "what did the user actually do" — never log into stdout instead. The `/api/commands` route handles this centrally; if you add a new entry point, replicate the same write.

## Org scoping is mandatory

Every Prisma query in app code must filter by `orgId`. There is no global view across organizations. Use `requireSession()` / `withOrg()` helpers from `src/modules/auth/` rather than reaching into the session manually.

## Database

- **Local Postgres only** for now. `pnpm db:up` brings up the docker-compose service. Do not assume Neon or any cloud DB until the deployment story is explicitly switched.
- **Integration tests hit the real DB.** Don't mock Prisma in tests — mocks have hidden migration drift in past projects.

## Module ownership

| Concern | Module |
|---|---|
| Auth, sessions, org bootstrap | `src/modules/auth/` |
| Project CRUD | `src/modules/projects/` |
| Canvas state, stencils, tools, hotkeys | `src/modules/editor/` |
| Geometry math (pure functions) | `src/lib/geometry/` |
| Measurement derivation | `src/modules/measurements/` |
| Price book, formula evaluator, quote builder | `src/modules/pricing/` |
| Validation rules | `src/modules/validation/` |
| HTML→PDF templates | `src/modules/exports/` |
| Command registry + categories | `src/modules/commands/` |

Cross-module imports are fine; bypassing the command registry is not.

## Nothing off-brand ships

`docs/brand-bible.md` is the product's visual specification, and it is enforced
rather than requested. Colours come from `src/lib/brand.ts`: `SPECTRUM`, `INK`,
`TINTS`, `ACCENT_FAMILIES`, plus `TYPE_SCALE`, `SPACING`, `RADII` and
`ELEVATION` for everything that is not colour. Never write a hex value into a
component.

`src/test/unit/brand/palette.test.ts` fails the build on any colour in
`src/components` or `src/app` that is not in the palette, naming the file and
the value.

It is a ratchet. The files that predate the bible are listed in that test with a
reason each, and **that list may only ever get shorter**. Adding to it is
choosing to ship something off brand, which is a decision somebody should have
to write down and defend, not a thing that happens by default. Retire an entry
by replacing its hex values with tokens and deleting the line.

Two things are legitimately outside the palette, and both are already listed:
documents that render standalone for paper, where a county planner's
conventions win, and lit materials in the 3D scene, where picking water from a
brand spectrum would make the pool the wrong colour rather than make it on
brand.

Semantic colour is not free either. Amber means a warning and red means an
error, so a control being pointed at, highlighted or selected must not use them:
it would read as something being wrong. Reach for a spectrum hue that carries no
state.

## Build-priority discipline

`docs/build-priority.md` is the active roadmap (mirrors the product brief §17). Before adding scope, check whether it's listed there. If not, surface the question rather than silently expanding.
