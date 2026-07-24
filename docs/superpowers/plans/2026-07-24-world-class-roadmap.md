# Pool Forge — World-Class Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each track plan task-by-task. This file is the map; the per-track files hold the steps.

**Goal:** Take Pool Forge from "honest spine, scaffold surface" to a product a pool builder runs their business on — design → priced quote → premium signed proposal, on the web, with screen enclosures as the beachhead.

**Architecture:** Work is organised into a Wave 0 contract commit followed by four waves of parallel tracks. Wave 0 lands the shared type and seam changes that multiple tracks would otherwise collide on, so every later track owns a disjoint file set and can run as its own agent on its own branch.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · Prisma 6 + Postgres · three.js / react-three-fiber · Zustand · Zod · Vitest + Playwright · Tailwind + shadcn.

## Global Constraints

Copied from `CLAUDE.md` — these apply to every task in every track:

- Every user-driven action dispatches through `src/modules/commands/`. No UI event handler calls Prisma or a domain module directly.
- Every command execution writes a `CommandAuditLog` row. `/api/commands` does this centrally.
- Every API route, server action, and command validates input with Zod.
- Every Prisma query in app code filters by `orgId`; use `requireSession()` / `withOrg()` from `src/modules/auth/`.
- Strict TS: don't spread optional params (`{ ...{ f: undefined } }` violates `exactOptionalPropertyTypes`); indexed access is `T | undefined`.
- Local Postgres (`pnpm db:up`) until Track 8 lands. Integration tests hit the real DB — do not mock Prisma.
- Internal unit convention: **1 canvas unit = 1 inch**. Geometry helpers return feet / square feet. `lib/three/units.feet()` converts to scene units.
- New Prisma models need a migration file in `prisma/migrations/` in the same commit as the schema change.
- Gates for every task: `pnpm typecheck`, `pnpm test`, `pnpm lint` clean before commit.

---

## Wave map

```
WAVE 0  ── contract commit (1 agent, blocking) ────────────────────────────┐
                                                                           │
WAVE 1  ── truth: make the app do what it appears to do (4 parallel) ──────┤
   T1 Materials real          T2 Pool footprints real                      │
   T3 Pricing coverage        T4 Direct manipulation                       │
                                                                           │
WAVE 2  ── the deliverable: what wins the deal (4 parallel) ───────────────┤
   T5 Scene render in documents   T6 Server PDF + stored artifact          │
   T7 E-sign, send + track        T8 Deploy to Neon + host                 │
                                                                           │
WAVE 3  ── render ladder: reach table-stakes photoreal (2 parallel) ───────┤
   T9 HDRI/IBL + PBR sets    T10 Water shader + caustics                   │
   T11 AO + post stack       T12 Server render + pano share                │
   T13 Asset library (ongoing)                                             │
                                                                           │
WAVE 4  ── the business chain + platform debt (4 parallel) ────────────────┘
   T14 Payments + financing   T15 QuickBooks sync
   T16 Mobile / tablet        T17 Registry + audit completion
   T18 Test debt
```

**Hard dependencies:** T9 needs T1's material slots. T5 needs T2 (rendering a box pool into the proposal is worse than no render). T12 needs T9–T11. T6 unblocks T7's "what exactly did they sign". Everything else is independent.

**Detailed plans:** Wave 0 and Wave 1 tracks have full step-by-step plans in this directory now. Wave 2–4 tracks carry scope, interfaces, and acceptance criteria here; their step plans get written at the start of each wave, because writing them now would encode assumptions about code that Waves 1–2 are about to change.

---

## Wave 0 — Contract commit

**Plan:** `2026-07-24-w0-contract.md`

One agent, no parallelism. Lands the shared surface that Wave 1 tracks would otherwise fight over: `Shape` gains a material-slot and footprint field, `SceneRoot` gets a renderer-registry seam, and pool metrics move behind one function. Ships with no behaviour change and a green suite.

**Acceptance:** `pnpm typecheck && pnpm test && pnpm build` clean; a drawing saved before the change loads unchanged after it; `poolFootprintMetrics()` returns byte-identical numbers to today's inline math for rectangle and ellipse pools.

---

## Wave 1 — Truth

### T1 — Materials are real
**Plan:** `2026-07-24-w1-t1-materials.md`

Today `set.shape.material` and `pool.material.set` echo their input and return; `MaterialSection` renders hardcoded options with invented costs. Make selection persist on the shape, drive the three.js material, and reach the quote.

**Owns:** `modules/editor/state/shapes.ts` (slots already added in W0), `ClientCommandHandlers.tsx` material handlers, `three/Materials.ts`, `three/objects/{PoolWalls,Water,Coping,TileBand,Deck,EllipsePool}.tsx`, `shell/inspector/MaterialSection.tsx`, `shell/materials/MaterialGrid.tsx`, `modules/materials/`, `prisma/seed.ts` material rows.

**Acceptance:** picking an interior finish changes the rendered pool, survives reload, appears on the construction packet, and moves the quote when the chosen `Material` maps to a price-book item. No `PLACEHOLDER_OPTIONS` left in the tree.

### T2 — Pool footprints are real
**Plan:** `2026-07-24-w1-t2-footprints.md`

`SceneRoot` gives real meshes to 5 stencil id-sets; the other ~54 fall through to `GenericStencil`, so Roman/Grecian/kidney pools are boxes. Give the pool-shape category real footprints (extruded polygon / ellipse), measured and drawn consistently in 3D, plan SVG, and documents.

**Owns:** `lib/geometry/footprints.ts` (new), `three/objects/FootprintPool.tsx` (new), `three/renderers.ts` registry entries for pool shapes, `modules/measurements/engine.ts` pool branch, `modules/exports/svg.ts`, `components/exports/DrawingSvg.tsx`.

**Acceptance:** every stencil in `StencilCategory.POOL_SHAPE` renders its own silhouette in 3D and in the plan SVG; measured area/perimeter come from that silhouette; a Grecian pool and a rectangle of the same bounding box produce different `poolSurfaceArea`.

### T3 — Pricing covers the catalog
**Plan:** `2026-07-24-w1-t3-pricing.md`

`PriceBookItem.formula` is a dead column, six `PriceCategory` values always price at 0, and screen is billed by deck area rather than cage surface — wrong for the beachhead.

**Owns:** `modules/pricing/formula.ts` (new), `modules/pricing/engine.ts`, `modules/measurements/engine.ts` screen/cage metrics, `settings/price-book/` formula editing UI, `test/unit/pricing-*.test.ts`.

**Acceptance:** a price-book item with a formula prices from it; LANAI / WATER_FEATURE / FENCE / WALL / ELECTRICAL / MISC either price from a real measurement or are visibly marked manual-entry in the UI; screen price derives from cage surface area (walls + roof), not deck footprint.

### T4 — Direct manipulation
**Plan:** `2026-07-24-w1-t4-manipulation.md`

No on-canvas resize or rotate, no marquee multi-select, and `HOTKEYS` is defined but never bound to a listener so no shortcut in it fires.

**Owns:** `three/TransformGizmo.tsx` (new), `three/DragHandler.tsx`, `three/ToolGestures.tsx`, `modules/editor/hotkeys/` + a new `HotkeyBinder.tsx`, `shell/EditorLayout.tsx` mount point.

**Acceptance:** drag a corner handle to resize and a ring to rotate, both coalesced into one undo entry; marquee selects multiple shapes; every shortcut in `HOTKEYS` either fires its command or is removed from the table — none silently does nothing.

---

## Wave 2 — The deliverable

### T5 — The scene appears in the documents
The 3D scene is the best asset in the product and appears in none of the four documents. Render an offscreen snapshot (requires `preserveDrawingBuffer` or an explicit `WebGLRenderTarget` pass — the current `<Canvas>` has neither) and embed it in the proposal and construction packet.

**Interfaces:** `captureSceneImage(opts: { view: 'iso' | 'top'; width: number; height: number }): Promise<string>` returning a data URL; command `export.captureScene`; the image persists on `Drawing` or a new `DrawingSnapshot` model so server-rendered documents can read it without a browser.

**Acceptance:** the customer proposal shows a rendered view of the actual design, refreshed on demand from the editor, and the construction packet shows an orthographic plan render.

### T6 — Server PDF + stored artifact
Exports are `window.print()`. `Export.url` points at a route, not a file, so there is no immutable record of what was sent.

**Interfaces:** headless Chromium (Playwright is already a dev dependency; a hosted equivalent works too) rendering the existing document routes to PDF; blob storage; `Export.url` becomes the artifact URL; `Export` gains `checksum` + `bytes`.

**Acceptance:** exporting produces a stored PDF whose URL renders the same document a month later regardless of price-book edits; the audit row and the artifact agree.

### T7 — E-sign, send, and track
The share link plus typed-name acceptance exists. Missing: signature capture, IP/user-agent/timestamp trail, countersign, email delivery, view tracking, expiry enforcement.

**Interfaces:** `ProposalSignature` model (`proposalId`, `signerName`, `signatureSvg`, `ip`, `userAgent`, `signedAt`); `ProposalEvent` model for sent/viewed/accepted; commands `proposal.send`, `proposal.void`.

**Acceptance:** a customer signs in the browser, both parties get a PDF copy, the builder sees "viewed 3×, signed 2026-08-02", and an expired proposal refuses acceptance. No design competitor in `docs/competitive-analysis.md` has this.

### T8 — Deploy
`docs/deploy.md` is a runbook; the app has never run outside a laptop.

**Acceptance:** production URL on Neon + a Node host, `prisma migrate deploy` applied, secrets set, smoke test green in CI on every push to `main`. Requires operator steps only Billy can do (Neon project, host project, `AUTH_SECRET`).

---

## Wave 3 — Render ladder

Sequenced by dependency; the market read in `docs/competitive-analysis.md` sets the bar (Pool Studio 4/5 is the bar, D5 5/5 the aspiration).

- **T9 HDRI/IBL + PBR material sets.** Highest ratio of impact to effort — gives the existing physical water/glass/metal something to reflect. Depends on T1 slots.
- **T10 Water shader.** Animated flow-map normals, reflection/refraction, depth absorption, projected caustics. The signature effect and the hardest real-time item.
- **T11 AO + post stack.** GTAO, SSR, subtle bloom, SMAA/TAA.
- **T12 Server render + pano share.** Progressive path-traced stills (Blender/Cycles farm per the Cedreo pattern, or `three-gpu-pathtracer` in the Electron build), plus the cheap win: cubemap panorama on the share page with a WebGL viewer — the trick Lumion and Twinmotion both converged on.
- **T13 Asset library.** GLTF + KTX2/Draco, instanced vegetation/furniture/hardscape. The incumbents' real moat, a curation problem more than an engineering one. Ongoing, not a milestone.

**Acceptance for the wave:** a builder can produce a still a homeowner reacts to, from a browser, and put it in front of them via a link with no download.

---

## Wave 4 — Business chain and platform debt

- **T14 Payments + financing.** Stripe deposits; a "$X/month" line beneath the total (Hearth/Wisetack benchmark). This is the "out-integrate them" thesis made concrete.
- **T15 QuickBooks sync.** Approved quote → invoice. Per the global note: persist each external resource id to a local ledger before starting the next step in the sequence.
- **T16 Mobile / tablet.** The editor hard-codes `min-w-[1024px]`; the share page and proposal must be excellent on a phone even if the editor stays desktop-first.
- **T17 Registry + audit completion.** Project CRUD, price-book CRUD, and drawing saves still bypass the command registry and write no audit row — a direct violation of this repo's own non-negotiable rule.
- **T18 Test debt.** 48 `it.todo` tests; no test covers drawing → quote → document end to end. Every bug fixed on 2026-07-24 (dropped `required`, missing tax, empty-cache-as-$0) was invisible to the suite. Add an integration harness against the real DB plus a Playwright money-path spec.

---

## Ordering advice

If you want revenue impact per unit of effort: **T1 → T5 → T6 → T7 → T8**, then the render ladder. That sequence turns the app from "looks finished" into "produces a signed document from a real design", deployed, before spending a single day on shaders.
