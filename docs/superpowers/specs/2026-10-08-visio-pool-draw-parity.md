# Visio + Pool Draw + Excel parity: design

Source: a working pool designer's screen recording (2026-10-08) of the workflow
Pool Forge has to replace. The stack is Microsoft Visio with a paid "Pool Draw"
add-in for sizing, three custom stencil files (`Pool.vss`, `Spa.vss`,
`House&Deck.vss`, 218 masters), and an Excel price book with a breakdown tab the
drawing numbers are typed into by hand.

The one sentence that matters, verbatim: "if it could somehow communicate with my
Excel pricing sheet ... and automatically price it out for me as I draw it, that
would be a million dollar idea." That is the live quote, and it already ships. The
work below is everything that stops this designer from doing their whole day in
Pool Forge.

## 1. Their workflow, item by item

Status is against `main` at `3b50ae4`. Evidence is the file that proves it.

| # | What they do | Status | Evidence |
|---|---|---|---|
| 1 | Drag templates (steps, ledges, spas, pillars, raised decks, bowls) over the pool, rotate, delete to revert | **Have** for the built-in catalog (75 stencils) | `src/modules/editor/stencils/index.ts` |
| 2 | Use *their own* templates, built over years to their spec | **Missing** | `StencilDef` is global, no geometry, no org rows |
| 3 | Swap the deck surface: concrete, paver (2'×2' diagonal score), grass, each with its own look | **Partial**: three deck kinds exist and measure, but all three render as concrete | `Deck.tsx:15` hardcodes `concreteDeck`; `SceneRoot.tsx:138` routes all three kinds to it |
| 4 | Coping as a 6" offset ring with 1" square hatch; concrete deck is "seamless" with no offset | **Partial**: coping auto-renders and bills by LF, but width is fixed and it shows on concrete decks too | `Coping.tsx`, `SceneRoot.tsx:121` |
| 5 | Send back / bring forward to layer overlays | **Missing**: tool listed, no handler | `tools/index.ts:491`; no `bring-forward` in `ClientCommandHandlers.tsx` |
| 6 | Dimension lines at 0 / 45 / 90 / -45 with the measured length | **Missing**: tool listed, no handler; only fixed setback labels exist | `tools/index.ts:339`, `PlanOverlay.tsx` |
| 7 | Callouts, labels, deep-end / shallow-end notes | **Missing** as tools (listed, no handler); comments exist as a separate system | `tools/index.ts:355,371` |
| 8 | Guard alarm, lights, drains, jets, bubblers as symbols | **Have** | `CONSTRUCTION_SYMBOL` + `INTERIOR_FEATURE` stencils |
| 9 | "Master templates" of past pools with correct footages, to see what fits | **Partial**: duplicate project exists, no template gallery | `projects/actions.ts:52` |
| 10 | Sheets: customer drawing, scaled survey, onion-skin construction, screen quote | **Have** as the four exports plus survey underlay | `src/modules/exports/`, Wave I ingest |
| 11 | Size tool: area, perimeter, length, width, angle | **Have** | measurement engine + inspector |
| 12 | Type a target area and the freeform shrinks to it, proportions kept | **Partial**: client handler scales by sqrt(target/current); `build-priority.md` still calls it a stub, no test covers polygon pools | `ClientCommandHandlers.tsx:712` |
| 13 | "Show radius" on a freeform so the crew can lay out the big circles | **Missing** | |
| 14 | Pick a specific product (AquaCal SQ140 heat pump, $4,800) and it lands on the breakdown; remove it and it leaves | **Partial**: equipment is a boolean `heaterSelected`, not a chosen price-book line | `pricing/engine.ts:135,413` |
| 15 | Validation mark that says the sheet has no errors | **Have** | validation engine, 12 rules |
| 16 | Screen quote from estimated square footage plus extras | **Partial**: `SCREEN` category and RFQ export exist; no sq-ft calculator | `pricing/engine.ts:427` |
| 17 | Price updates as the drawing changes | **Have** | live quote |

Seven of seventeen are done, six are partial, four are missing. Nothing missing
needs a new subsystem; every gap lands in the editor, the command registry, or
the price book.

## 2. Phases

Each phase is independently shippable, touches a disjoint file set from the
others so agents can run in parallel, and carries its own acceptance tests. Every
new user action is a registered command with a Zod input schema and an audit row,
per `CLAUDE.md`.

### P0: close the stale items (small, first)

- Prove `set.pool.targetArea` on both `RECTANGLE_POOL` and `POLYGON_POOL`.
  Property test: for any ring and any target in [50, 2000] sqft, the result area
  is within 0.5% and the aspect ratio is unchanged. Flip `build-priority.md` item 8.
- Acceptance: the transcript's exact case. A 303 sqft kidney set to 238 reports 238.

### P1: plan-view fidelity (the deck, the coping, the layering)

The designer judges the drawing by how the deck reads. This phase makes the three
deck kinds look like three things in plan and in 3D.

- `Deck.tsx` picks material by `shape.kind` and by `shape.materials.surface`
  when a price-book material is chosen: concrete (flat, light), paver (texture
  plus a 2' diagonal score grid drawn as lines in plan view), grass (texture).
  Score spacing and angle are a `displayHint` (`scoreFt`, `scoreAngleDeg`), so
  the 1' square and 2' diagonal variants in their stencils map directly.
- Coping gains `widthIn` (default 6") on `displayHint`, and is off by default on
  a `CONCRETE_DECK` that touches the pool ("seamless"). Plan view draws the
  1" hatch inside the ring.
- Z-order: `order.bringForward`, `order.sendBackward`, `order.bringToFront`,
  `order.sendToBack` commands that rewrite `zIndex`; hotkeys `]` `[` and shifted.
- Acceptance: snapshot tests of the plan SVG for one pool with each deck kind;
  a unit test that the construction export's coping LF is unchanged by the hint.
- Files: `three/objects/Deck.tsx`, `three/objects/Coping.tsx`,
  `exports/svg.ts`, `commands/categories/order.ts` (new), `editor/hotkeys/`.

### P2: annotation tools (dimension lines, labels, callouts)

- New shape kinds `DIMENSION_LINE`, `LABEL`, `CALLOUT` (migration + `ShapeKind`
  enum). A dimension line stores two endpoints in inches and renders its length in
  feet-and-inches; snaps to 0 / 45 / 90 / -45 when drawn with shift held.
  Visible on plan and construction sheets, hidden on the customer proposal by
  default (`exportVisibility`).
- Commands `annotate.dimension.add`, `annotate.label.add`, `annotate.callout.add`
  back the three listed tools that have no handler today.
- Acceptance: drawing a dimension between two pool corners of a 25' pool labels
  it `25'-0"`; rotating the pool keeps the line attached to the same corners.
- Files: `editor/state/shapes.ts`, `three/objects/Dimension.tsx` (new),
  `three/objects/Annotation.tsx` (new), `commands/categories/annotate.ts` (new),
  `exports/svg.ts` (annotation branch only), `prisma/`.

### P3: their library (Visio import + saved templates)

Two features, one table.

- `OrgStencil` (org-scoped): name, category, shapeKind, outline rings in inches,
  width, height, fill, stroke, thumbnail SVG, source (`VISIO_IMPORT` |
  `SAVED_SELECTION` | `SAVED_PROJECT`).
- **Visio import.** `libvisio-tools` in the runtime Docker stage; an
  `imports/visio/` module shells out to `vss2raw`, flattens arcs and beziers into
  point rings, applies the drawing scale (1/8" = 1', inferred from a known master
  and editable in the preview), and emits one candidate per master. Preview
  screen reuses the XLSX import pattern: thumbnail grid, suggested category from
  the master name, skip list with reasons (text-only masters, raster swatches,
  dimension lines). Command `stencil.library.import`. Verified against all three
  files on 2026-10-08: every master converts; about 150 of 218 carry geometry.
- **Save as template.** `stencil.library.saveSelection` turns the selected
  shapes into one `OrgStencil`; `project.saveAsTemplate` snapshots a whole
  drawing into a gallery shown on new-project. This is their "master templates
  of pools we have done, with the correct footages".
- Placing an `OrgStencil` creates a `POLYGON_POOL`, `SKETCH_PATH`, deck, or
  `STENCIL` shape by category, so measurement and pricing are unchanged.
- Acceptance: integration test imports `Pool.vss`, asserts the Standard
  Rectangle lands at 25'×12' and the kidney's area is within 1% of the Visio
  figure; a saved selection round-trips through place and measure.
- Files: `imports/visio/` (new), `prisma/`, `app/api/imports/visio/` (new),
  `components/editor/shell/StencilPanel*` (new "My library" group),
  `Dockerfile`, `.env.example` if a size cap is added.

### P4: pricing parity (pick a product, screen quote)

- **Product options.** Replace the boolean `heaterSelected` /
  `saltSystemSelected` with `ProjectOption { priceBookItemId, quantity }` rows.
  The quote panel gets a "Add from price book" picker scoped to `EQUIPMENT`,
  `LIGHTING`, `WATER_FEATURE`, `MISC`. Adding the AquaCal line puts $4,800 on the
  breakdown under Equipment; removing it removes it. Migration keeps the two
  booleans readable until backfilled.
- **Screen quote.** A `SCREEN` calculator: enclosure sqft from the lanai + deck
  footprint by default, overridable, times the price-book rate, plus extras as
  options above. Feeds the existing RFQ export.
- Acceptance: money-path test extends to one equipment option and one screen
  line; the proposal shows both; a sent proposal keeps them when the book changes.
- Files: `pricing/engine.ts`, `prisma/`, `components/editor/shell/QuoteDock.tsx`,
  `commands/categories/pricing.ts`.

### P5: show radius

- For a `POLYGON_POOL`, fit circular arcs to the ring (RANSAC over runs of
  consecutive points, tolerance 1"), and render each fitted arc's center and
  radius on the construction sheet as the crews lay out from.
- Acceptance: the imported kidney reports the same big-circle radii the Visio
  add-in shows, within 3".
- Files: `lib/geometry/arc-fit.ts` (new), `exports/` construction branch.

## 3. Order and parallelism

P0 first and alone (half a day). P1, P2, P3 and P4 are disjoint and run in
parallel. P5 waits on P3 for the kidney fixture.

## 4. Non-goals

- 3D from Visio (they never used Pool Draw's 3D; Pool Forge already has its own).
- Importing the Excel price book's tab logic. The XLSX importer takes the rows;
  the formulas stay in Excel. `PriceBookItem.formula` stays dead.
- Cutting and boolean operations between shapes. Overlays plus z-order cover what
  the transcript shows.

## 5. Open questions for review

1. P3 scope: outline geometry only (skip text and raster masters), or carry the
   text masters in as `CALLOUT` shapes from P2?
2. P4 data model: `ProjectOption` rows versus adding `quantity` to the existing
   `ProjectLineItem` and pointing it at a price-book item. The second is smaller.
3. Does this jump the queue ahead of I6, the way Wave I did?
