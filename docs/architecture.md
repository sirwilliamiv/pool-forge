# Architecture

## Command-registry-first

The single most important architectural decision in Pool Forge is that **every user-driven action dispatches through a typed command registry**. Toolbar buttons, keyboard shortcuts, server actions, and the future voice agent are all thin shells over the same `EditorCommand.execute()` call.

```
UI button ─┐
hotkey   ──┼──► commandRegistry.execute(id, input, ctx) ──► writes CommandAuditLog
voice    ──┘                                              └► returns CommandResult
```

This keeps the app voice-ready, macro-ready, and automation-ready without a rewrite. Commands live in `src/modules/commands/categories/` (one file per category: project, canvas, shape, measurement, pricing, validation, export, template, auth, settings).

## Rendering

One three.js / react-three-fiber canvas renders every view. The "2D plan view"
is the same scene under an orthographic camera (`three/CameraRig.tsx`) — there
is no Konva and no separate 2D renderer. Scene objects live one-per-file under
`components/editor/three/objects/`; `SceneRoot` dispatches on `ShapeKind`.

Units: state stores inches (1 canvas unit = 1 inch); `lib/three/units.feet()`
converts to scene units. Geometry helpers return feet / square feet.

## Module layout

```
src/
  app/                    Next.js App Router (route segments only — thin)
    (auth)/               login, register
    (app)/                dashboard, projects/[id], settings
    api/                  auth, commands, exports
  modules/                Domain logic — the substance of the app
    auth/                 sessions, password hashing, org scope helpers
    projects/             project CRUD + status machine
    editor/               canvas state, stencils, tools, hotkeys, components
    measurements/         derive area / perimeter / gallons / deck area
    pricing/              price book, formula evaluator, quote builder
    validation/           rules + pass / warn / error states
    exports/              HTML → PDF templates
    materials/            material/style registry
    commands/             registry + categories + audit
  components/             UI components (shadcn primitives + composed)
    ui/                   shadcn primitives
    editor/               editor-specific composed components
    dashboard/, project/  feature-specific components
  lib/
    db.ts                 Prisma client (Neon adapter prepared, commented)
    auth.ts               Auth.js v5 entry
    geometry/             pure functions (area, perimeter, scaling)
    zod/                  shared schemas
prisma/                   schema + seed
```

## Data flow

```
User edits canvas (drag/resize/rotate stencil)
        ↓
Editor Zustand store (selection, transform)
        ↓
DrawingObject geometry update (JSON)
        ↓
Measurement engine derives area/perimeter/gallons/deck area
        ↓                                                ↓
Pricing engine (price book + formulas)        Validation engine (rules)
        ↓                                                ↓
Live quote panel updates                  Pass / warn / blocking-error states
        ↓                                                ↓
                          Export (PDF) gated on validation
```

Every step writes through the command registry; the UI never bypasses it.

## Pricing reproducibility

`Quote.snapshot` (Json) captures the full input set — measurements, selections, price-book version, formula configs — so a quote can be replayed identically months later even if the price book has been edited. `PriceBook` is versioned for the same reason.

## Audit log

Every command write goes to `CommandAuditLog` with input, output, success flag, error message, and timestamp. This is the source of truth for "what did this user actually do" and powers undo, replay, and compliance review.

## Org scoping

There is no global view. Every Prisma read in app code filters by `orgId`. Helpers in `src/modules/auth/` (`requireSession()`, `withOrg()`) enforce this — reach for them rather than parsing the session manually.

## Why local Postgres now (not Neon)

The brief recommends Neon, and the schema is Neon-ready (`@prisma/adapter-neon` import is documented and commented in `src/lib/db.ts`). For development we run Postgres in Docker because (a) it's faster than network-bound serverless during heavy schema iteration, (b) it sidesteps Neon cold-start handling, and (c) the swap is a one-line change when deployment is on the agenda.
