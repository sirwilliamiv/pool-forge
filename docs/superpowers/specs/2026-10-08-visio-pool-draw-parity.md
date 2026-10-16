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

### P3: their library (Visio import, drag and drop)

Hardened 2026-10-16 before build. Scope answered: outline geometry only. Text
masters, raster swatches and anything without a closed outline are skipped and
listed with the reason; nothing becomes a `CALLOUT` here (that is P2's job).
"Save as template" from a selection is deferred to its own pass; this section
is the import and the drag and drop that makes it usable.

**What the designer does.** Drag `Pool.vss` from the desktop onto the Stencils
panel. A preview shows every master as a silhouette with a suggested name,
category and shape kind, plus the list of masters that will be skipped and
why. They untick what they do not want, fix a category, press Import. A "My
library" group appears at the top of the Stencils panel. From then on they drag
a library stencil (or any built-in one) straight onto the canvas and it lands
where the pointer was released, centred on it, at real size. Click-to-add into
the staging block keeps working.

**Scale.** Visio stencil geometry is in drawing inches at the designer's sheet
scale, 1/8" = 1'. One drawing inch is 96 real inches. `Standard Rectangle` is
3.125" x 1.5" in the file and 25' x 12' in the yard, which is how the default
is confirmed. The preview shows the scale and lets the builder change it before
committing; the chosen scale is stored on the import row.

**Geometry pipeline** (`src/modules/imports/visio/`, pure functions, no DB):

1. `vss2raw` (libvisio-tools, Alpine community package, already in Homebrew)
   is run on the uploaded file. Its text output is the only thing parsed. The
   binary is never parsed in process. `.vss` is OLE2 (`D0 CF 11 E0 A1 B1 1A E1`)
   and `.vssx` is a zip (`PK\x03\x04`); the route sniffs those bytes, never the
   extension or the declared type. Cap 25 MB. A conversion failure surfaces as
   a generic message with an `err_` ref; the tool's stderr is logged, never
   returned.
2. `raw-parser.ts`: one `startPage` per master. `draw:name` is taken verbatim
   up to `, svg:height:` because names contain parentheses, quotes and
   ampersands (`Deck Jets (5)`, `Pool Light W&C`, `8" Tan  Brick`). Unnamed
   pages are `Untitled master N`. Layers are flattened: every `drawPath` in the
   page is collected with the `setStyle` immediately before it (they are 1:1 in
   every file). `startTextObject` and `drawGraphicObject` are counted, not
   parsed. Path actions seen across all three files: `M L A Q C Z`. Arcs carry
   `rx ry rotate large-arc` and sometimes `sweep` (absent means 0).
3. `flatten.ts`: `A` by SVG endpoint parameterisation, `Q` and `C` by de
   Casteljau, all to polylines with chord error at most 0.005 drawing inches
   (half a real inch at 1/8" scale). `Z` closes a subpath; a `M` inside a path
   starts a new subpath. Degenerate subpaths (fewer than three distinct points)
   are dropped.
4. `outline.ts`: the footprint is the union of every closed filled subpath,
   computed with `polygon-clipping` (MIT, pure JS). `Round Corners` is a
   rectangle plus four discs in five layers and comes out as one rounded ring.
   The largest polygon of the union is the outer ring; the rest are detail
   rings kept for the thumbnail only. Masters with no filled closed subpath fall
   back to closed stroke-only subpaths. Masters with neither are skipped as
   `NO_OUTLINE`: that is every dimension line, hairline marker and arrow.
5. `scale.ts`: rings are scaled to real inches and translated so the bounding
   box's top-left is the origin, matching `PolygonPool.points` and
   `SketchPath.points`. Visio's y axis points up; the raw output already has y
   down (checked against `Standard Rectangle`), so no flip.
6. `classify.ts`: suggested `StencilCategory` and `ShapeKind` from the master
   name and the file name, as a table of regexes in one file so a wrong guess is
   a one-line fix. Pool shapes (`rectangle|roman|grecian|kidney|freeform|
   corners|lazy l|master` in a file called Pool) become `POLYGON_POOL` with the
   ring as the footprint. Spas become `SPA` at bounding-box size. Decks, lanais
   and grass become their deck kinds at bounding-box size. Everything else
   (steps, ledges, benches, bowls, pillars, symbols) becomes a closed
   `SKETCH_PATH` carrying the ring, with `labelText` set to the stencil name, so
   it draws its actual outline over the pool the way the Visio master did and
   can be converted later with the existing sketch tools. Measurement and
   pricing code is untouched: a polygon pool measures and prices as a polygon
   pool already does, and a sketch is construction geometry.
7. `thumbnail.ts`: an SVG string from the rings, viewBox equal to the bounding
   box, fill and stroke from the master's own colours. Stored on the row so the
   panel never recomputes it.

**Data model.** `OrgStencil` (org-scoped, cascade on org delete): `name`,
`category`, `shapeKind`, `rings` (Json, `{x,y}[][]`, real inches, first ring is
the footprint), `widthIn`, `heightIn`, `fill`, `stroke`, `thumbnailSvg`,
`source` (`VISIO_IMPORT | SAVED_SELECTION`), `sourceFile`, `sourceMaster`,
`createdBy`. Unique on `(orgId, name)`: the three files share names (`Guard
Alarm`, `Call Out`, `8" Tan Brick`) and a re-import replaces rather than
duplicates. `StencilImport` holds a preview between the two calls: `orgId`,
`fileName`, `scaleInchesPerInch`, `candidatesJson`, `skippedJson`, `status`
(`PENDING | COMMITTED | DISCARDED`), `expiresAt` (one hour). A preview is a row
rather than process memory because Cloud Run may answer the commit from a
different instance.

**Commands** (category `template`, all server-side except the last):

- `stencil.library.preview { uploadRef, scaleInchesPerInch? }` creates the
  `StencilImport` and returns `{ importId, fileName, scale, candidates[],
  skipped[] }`. The route `/api/imports/visio` stages the bytes exactly the way
  the image upload route does and dispatches this; it never converts anything
  itself.
- `stencil.library.commit { importId, scaleInchesPerInch, items[{ index, name,
  category, shapeKind, include }] }` upserts one `OrgStencil` per included item
  and marks the import `COMMITTED`. Returns `{ created, replaced, stencils[] }`.
  A second commit of the same import is refused.
- `stencil.library.list {}` returns the org's stencils without rings.
- `stencil.library.place { orgStencilId, x, y }` runs on the client: the server
  loads the row (org-scoped) and returns `{ shapeKind, name, points, width,
  height }`; the client handler calls `addShape` with the points so the shape
  is born complete in one undo step. `x, y` is the top-left in inches.
- `stencil.library.delete { orgStencilId }`.

Every one writes its `CommandAuditLog` row through `dispatchCommand`. `preview`
and `commit` have no voice examples and stay out of the voice surface.

**Drag and drop.** Two drags, one MIME type.

- *File in:* the Stencils panel is a drop target for files via the existing
  `useFileDrop`. A dropped `.vss`/`.vssx` posts to `/api/imports/visio` and
  opens the preview dialog. The "My library" group's empty state is a dashed
  zone that says so, with a Choose file button for people who do not drag.
- *Stencil onto canvas:* every stencil card is `draggable`; `dragstart` writes
  `application/x-poolforge-stencil` with `{ source: 'catalog' | 'library', id
  }`. A `CanvasDropTarget` mounted inside `<Canvas>` listens on the WebGL
  element, calls `groundPoint` (the same function the drawing tools use, so a
  drop and a click agree about where the ground is) and dispatches `add.shape`
  or `stencil.library.place` with the top-left computed so the stencil is
  centred under the pointer. In side elevation the ground point is null and
  the drop is refused with a toast rather than dropped at the origin.

**Skipped, by reason:** `TEXT_ONLY` (`SOB Text`, `Tan Ledge 8 Font`, the
disclaimers), `RASTER` (`R_Concrete`, `R_Grass 1`, `R_Pebbles 1`,
`R_Sand-Brown`), `NO_OUTLINE` (dimension lines, `3' 0/45/90`, hairline
markers). Measured 2026-10-16: Pool.vss has 50 masters, Spa.vss 56,
House&Deck.vss 112; 26 of the 218 carry no vector geometry at all.

**Acceptance.**

- Unit, from checked-in `vss2raw` text of Pool.vss: `Standard Rectangle` lands
  as `POLYGON_POOL` 300 x 144 inches with four corners; `Round Corners` is one
  ring with a 27' x 16' bounding box; `Freeform Kidney 11` area at the default
  tolerance is within 1% of its area at ten times finer tolerance (convergence,
  since the Visio add-in's figure is not in the file); `SOB Text` is skipped
  `TEXT_ONLY`; `Deck Jets (5)` keeps its parentheses.
- Property: every flattened arc point lies within tolerance of the true
  ellipse; the union's bounding box equals the inputs' bounding box; scale then
  unscale is the identity within 1e-6.
- Integration (real Postgres, no mocks): preview, commit, list, place and delete
  for one org are invisible to another; commit twice is refused; a re-import
  replaces by name; every call leaves an audit row with the user and org.
- Opt-in integration (`VISIO_STENCIL_DIR` set, `vss2raw` on PATH): the real
  `Pool.vss` converts and 44 of 50 masters are candidates.
- The command wiring test proves `stencil.library.place` has a client handler.
- Playwright: drop `Pool.vss` on the panel, import, drag `Standard Rectangle`
  onto the canvas, the Layers panel lists it.

**Files:** `src/modules/imports/visio/{types,raw-parser,flatten,outline,scale,
classify,thumbnail,sniff,convert}.ts`, `src/modules/commands/categories/
stencil-library.ts`, `src/app/api/imports/visio/route.ts`, `prisma/` (two
models, one enum pair, one migration), `src/modules/editor/interactions/
stencil-drag.ts`, `src/modules/editor/state/libraryStore.ts`,
`src/components/editor/three/CanvasDropTarget.tsx`,
`src/components/editor/shell/stencils/{LibraryGroup,LibraryStencilCard,
VisioImportDialog}.tsx`, `StencilGrid.tsx`, `StencilCard.tsx`,
`ClientCommandHandlers.tsx`, `Dockerfile` (`apk add libvisio-tools` in the
runtime stage), `.env.example` (`VISIO_CONVERTER_BIN`), `docs/commands.md`.

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

1. P3 scope: answered 2026-10-16, outline geometry only; text and raster
   masters are skipped and listed with the reason.
2. P4 data model: `ProjectOption` rows versus adding `quantity` to the existing
   `ProjectLineItem` and pointing it at a price-book item. The second is smaller.
3. Does this jump the queue ahead of I6, the way Wave I did?
