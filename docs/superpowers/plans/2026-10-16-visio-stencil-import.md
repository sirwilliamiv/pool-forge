# Visio Stencil Import (drag and drop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A builder drags their Visio stencil file onto the Stencils panel, reviews the masters, imports them into an org-scoped library, and drags any stencil (theirs or ours) straight onto the canvas where it lands at real size under the pointer.

**Architecture:** `vss2raw` (libvisio-tools) converts the file to text; a pure pipeline in `src/modules/imports/visio/` parses, flattens, unions, scales and classifies each master into a candidate with a ring and a thumbnail. Five commands in the registry own every mutation (`preview`, `commit`, `list`, `place`, `delete`) with `OrgStencil` and `StencilImport` rows behind them. The panel gets a "My library" group with a file drop zone and a preview dialog; every stencil card becomes draggable and a `CanvasDropTarget` inside the WebGL canvas turns a drop into `add.shape` or `stencil.library.place` at the ground point.

**Tech Stack:** Next.js app router, TypeScript strict, Zod 3, Zustand, Prisma 6, react-three-fiber, `polygon-clipping` 0.15, vitest + fast-check + Testing Library, Playwright. `vss2raw` from libvisio-tools (Homebrew locally, `apk add libvisio-tools` in the runtime image).

**Spec:** `docs/superpowers/specs/2026-10-08-visio-pool-draw-parity.md`, section "P3: their library (Visio import, drag and drop)".

## Global Constraints

- No em dashes anywhere: code, comments, docs, commit messages, UI copy.
- Command-registry-first: every user-driven mutation dispatches through `src/modules/commands/`; the upload route stages bytes and dispatches, it never converts (repo CLAUDE.md).
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`: never spread optional params; build typed intermediates and conditionally assign.
- Zod at every boundary; commands declare `inputSchema` and `outputSchema`. The schemas already exist in `src/modules/imports/visio/types.ts`; import them, do not redeclare.
- Every Prisma query in app code filters by `orgId`.
- No raw third-party error text reaches a caller: converter stderr is logged under an `err_` ref via `logIngestFailure` from `src/modules/imports/ingest/errors.ts` and the caller gets `VisioMessage.CONVERT_FAILED` plus the ref.
- No magic strings: command ids come from `LibraryCommand`, skip reasons from `SkipReason`, messages from `VisioMessage`, drag source from `StencilDragSource`. The one exception is the literal id inside `registerClientHandler(...)`, which `src/test/unit/commands/wiring.test.ts` finds by regex.
- No hex colours in `src/components` or `src/app` (`src/test/unit/brand/palette.test.ts`). A stencil's own fill from the file is data on a variable, which is fine; a colour you choose is a token from `src/lib/brand.ts`.
- Tests hit the real local Postgres; never mock Prisma. Locally the Pool Forge database is on port 5434, not 5433:
  `export DATABASE_URL=postgresql://pool:pool@localhost:5434/poolforge DIRECT_DATABASE_URL=$DATABASE_URL`.
- Per-test unique ids in every unique-indexed field (`OrgStencil` is unique on `(orgId, name)`).
- Conventional commits; no Claude co-author trailers. Agents do not commit; the controller does.
- Run `pnpm vitest run <file>` for one file, `pnpm test` for the suite, `pnpm typecheck`, `pnpm lint`.

## Review Focus

Inputs the spec implies but no acceptance line covers, most likely to bite first. Each has its test pinned to the owning task.

1. A master name that already exists in the org from a different file (`Guard Alarm` is in Pool.vss and Spa.vss). Expected: the second import replaces the first and reports `replaced: 1`, never a unique-constraint error. Pinned in Task 3.
2. Two included items in one commit with the same name (the builder renamed one to collide). Expected: a readable refusal naming the duplicate, nothing written. Pinned in Task 3.
3. A `.vssx` (zip) dropped instead of `.vss`. Expected: accepted by the sniffer; `vss2raw` reads both. A `.png` renamed `.vss`: refused with `VisioMessage.NOT_A_STENCIL`, never passed to the converter. Pinned in Task 2.
4. A drop while the camera is in side elevation (no ground point). Expected: toast `VisioMessage.NO_GROUND`, no shape, no command dispatched. Pinned in Task 4.
5. A drop of a file onto the Stencils panel while a stencil card is being dragged (the browser carries both types in odd orders). Expected: the panel only reacts to `Files`, the canvas only to the stencil MIME; neither double-fires. Pinned in Task 4.

---

## Task 0: contracts (done by the controller, already on main)

- `pnpm add polygon-clipping@0.15.7`
- `prisma/schema.prisma`: `OrgStencil`, `StencilImport`, enums `OrgStencilSource`, `StencilImportStatus`; migration `20261016160242_org_stencils` applied locally.
- `src/modules/imports/visio/types.ts`: every shared type, constant, Zod schema, command id and user-facing message.
- `src/modules/imports/visio/pipeline.ts`: `previewFromRaw(raw, { fileName }): ConversionResult`, throwing stub, replaced by Task 1.
- `src/modules/editor/interactions/stencil-drag.ts` with its test `src/test/unit/editor/stencil-drag.test.ts`.
- Fixtures: `src/test/fixtures/visio/pool.raw.txt` (full `vss2raw` output of Pool.vss, 50 masters) and `src/test/fixtures/visio/house-deck-excerpt.raw.txt` (R_Concrete raster, Dimension Line 0, House, Grass, Concrete Lanai, Raised Deck; the JPEG payload is truncated to 40 characters).

Tasks 1, 2+3 and 4 are independent of each other and run in parallel in their own worktrees. Task 5 is the controller's integration.

---

## Task 1: the pure converter (geometry, classification, thumbnail, pipeline)

**Files:**
- Create: `src/modules/imports/visio/raw-parser.ts`
- Create: `src/modules/imports/visio/flatten.ts`
- Create: `src/modules/imports/visio/outline.ts`
- Create: `src/modules/imports/visio/scale.ts`
- Create: `src/modules/imports/visio/classify.ts`
- Create: `src/modules/imports/visio/thumbnail.ts`
- Replace: `src/modules/imports/visio/pipeline.ts`
- Test: `src/test/unit/imports/visio/raw-parser.test.ts`, `flatten.test.ts`, `outline.test.ts`, `scale.test.ts`, `classify.test.ts`, `thumbnail.test.ts`, `pipeline.test.ts`
- Test: `src/test/property/visio-geometry.property.test.ts`

**Interfaces:**
- Consumes: everything in `types.ts`; `polygonArea`, `polygonBounds` from `src/lib/geometry/polygon-footprint.ts`; `polygon-clipping`'s `union`.
- Produces (exact signatures, later tasks import these):

```ts
// raw-parser.ts
export function parseRaw(text: string): RawDocument

// flatten.ts
export function flattenPath(path: RawPath, tolerance?: number): FlatPath
export function flattenMaster(master: RawMaster, tolerance?: number): FlatPath[]

// outline.ts
export function outlineOf(paths: FlatPath[]): Outline | null

// scale.ts
export interface Normalized { rings: Ring[]; widthIn: number; heightIn: number }
/** Translate so the footprint's bounding-box top-left is (0, 0). Drawing inches in, drawing inches out. */
export function normalizeRings(rings: Ring[]): Normalized
/** Multiply by `inchesPerInch`. Call on already normalized rings; the origin stays at (0, 0). */
export function scaleRings(rings: Ring[], inchesPerInch: number): Normalized

// classify.ts
export interface Classification { category: StencilCategory; shapeKind: PlaceableShapeKind }
export function classifyMaster(name: string, fileName: string): Classification

// thumbnail.ts
export function thumbnailSvg(rings: Ring[], fill: string, stroke: string): string

// pipeline.ts (replaces the stub, same signature)
export function previewFromRaw(raw: string, opts: PreviewOptions): ConversionResult
```

### Task 1a: raw-parser

- [ ] **Step 1: Write the failing tests** at `src/test/unit/imports/visio/raw-parser.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRaw } from '@/modules/imports/visio/raw-parser'

const POOL = readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8')
const HOUSE = readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8')

describe('parseRaw', () => {
  const doc = parseRaw(POOL)

  it('finds every master in file order', () => {
    expect(doc.masters).toHaveLength(50)
    expect(doc.masters[0]?.name).toBe('Standard Rectangle')
    expect(doc.masters[0]?.index).toBe(0)
    expect(doc.masters[7]?.name).toBe('Freeform Kidney 11')
  })

  it('keeps parentheses, quotes and ampersands in names', () => {
    const names = doc.masters.map(m => m.name)
    expect(names).toContain('Deck Jets (5)')
    expect(names).toContain('Pool Light W&C')
    expect(names).toContain('8" Tan  Brick')
  })

  it('reads the page size in drawing inches', () => {
    const rect = doc.masters[0]!
    expect(rect.widthIn).toBeCloseTo(3.125, 6)
    expect(rect.heightIn).toBeCloseTo(1.5, 6)
  })

  it('pairs each path with the style set just before it, across layers', () => {
    // Round Corners: five layers, each a filled path then a stroked copy.
    const round = doc.masters.find(m => m.name === 'Round Corners')!
    expect(round.paths).toHaveLength(10)
    expect(round.paths[0]?.style).toEqual({ fill: true, stroke: false, fillColor: '#00ffff', strokeColor: '#000000' })
    expect(round.paths[1]?.style).toEqual({ fill: false, stroke: true, fillColor: '#00ffff', strokeColor: '#000000' })
  })

  it('decodes every segment kind', () => {
    const rect = doc.masters[0]!.paths[0]!
    expect(rect.segments.map(s => s.action)).toEqual(['M', 'L', 'L', 'L', 'L', 'Z'])
    const arc = doc.masters.find(m => m.name === 'Round Corners')!.paths[2]!.segments[1]!
    expect(arc).toEqual({ action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: true, sweep: false, x: 0.25, y: 1.5 })
  })

  it('counts text and pictures without parsing them', () => {
    const text = doc.masters.find(m => m.name === 'SOB Text')!
    expect(text.paths).toHaveLength(0)
    expect(text.textObjects).toBe(1)
    const raster = parseRaw(HOUSE).masters.find(m => m.name === 'R_Concrete')!
    expect(raster.graphicObjects).toBe(1)
    expect(raster.paths).toHaveLength(0)
  })

  it('names an unnamed page after its position', () => {
    const text = 'startDocument()\n  startPage(svg:height: 0.75in, svg:width: 0.75in)\n  endPage\nendDocument()\n'
    const [m] = parseRaw(text).masters
    expect(m?.name).toBe('Untitled master 1')
    expect(m?.named).toBe(false)
  })

  it('reads an explicit sweep flag', () => {
    const text = [
      'startDocument()',
      '  startPage(draw:name: S, svg:height: 1.0000in, svg:width: 1.0000in)',
      '    setStyle(draw:fill: solid, draw:fill-color: #ff0000, draw:stroke: none)',
      '    drawPath (svg:d: ((librevenge:path-action: M, svg:x: 0.0000in, svg:y: 0.0000in), (librevenge:large-arc: 0, librevenge:path-action: A, librevenge:rotate: 0.0000, librevenge:sweep: 1, svg:rx: 0.5000in, svg:ry: 0.5000in, svg:x: 1.0000in, svg:y: 0.0000in), (librevenge:path-action: Z)))',
      '  endPage',
      'endDocument()',
    ].join('\n')
    const seg = parseRaw(text).masters[0]!.paths[0]!.segments[1]
    expect(seg).toMatchObject({ action: 'A', sweep: true, largeArc: false })
  })
})
```

- [ ] **Step 2: Run it, expect failure** (`parseRaw` does not exist).

- [ ] **Step 3: Implement `raw-parser.ts`.** Line oriented. Rules, from the real files:
  - `startPage(` opens a master. Name: `/^\s*startPage\((?:draw:name: (.*), )?svg:height: ([\d.]+)in, svg:width: ([\d.]+)in\)\s*$/`. The name is everything between `draw:name: ` and `, svg:height:` (greedy `.*` is right because `svg:height` comes after the name; the real files have no commas in names, but greedy is still correct). No name: `Untitled master ${index + 1}`, `named: false`.
  - `setStyle(...)`: parse `draw:fill`, `draw:fill-color`, `draw:stroke`, `svg:stroke-color` with `/(\S+?): ([^,)]+)/g` over the parenthesised body. `fill = value of draw:fill exists and !== 'none'`; same for stroke. Colours lower-cased, `/^#[0-9a-f]{6}$/` or null. An empty `setStyle()` resets to `{ fill: false, stroke: false, fillColor: null, strokeColor: null }`. Keep "last style seen" in the current page; a `drawPath` takes it.
  - `drawPath (svg:d: ((...), (...)))`: split the inner list on `), (` after stripping the `((` and `)))`. Each group is `key: value` pairs separated by `, `. Numbers: strip a trailing `in`. `librevenge:large-arc`/`librevenge:sweep` are `0|1`, default false. Unknown actions are ignored (none exist in the files; keep the parser honest with a `default` branch that skips).
  - `startTextObject` increments `textObjects`; `drawGraphicObject` increments `graphicObjects`. `startLayer`/`endLayer` are ignored entirely (layers nest and paths also appear outside layers).
  - `endPage` closes the master. Lines outside a page are ignored.
  - Stop after `MAX_MASTERS_PER_FILE` masters.

- [ ] **Step 4: Run the test, expect pass.**

### Task 1b: flatten

- [ ] **Step 1: Write the failing tests** at `src/test/unit/imports/visio/flatten.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { flattenPath } from '@/modules/imports/visio/flatten'
import { FLATTEN_TOLERANCE_IN, type RawPath } from '@/modules/imports/visio/types'

const style = { fill: true, stroke: false, fillColor: '#00ffff', strokeColor: null }

describe('flattenPath', () => {
  it('leaves a polygon alone and marks it closed', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 2, y: 0 }, { action: 'L', x: 2, y: 1 }, { action: 'L', x: 0, y: 1 }, { action: 'L', x: 0, y: 0 }, { action: 'Z' },
    ] }
    const [sub] = flattenPath(path).subpaths
    // The closing point that repeats the start is dropped: rings store each vertex once.
    expect(sub?.points).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }])
    expect(sub?.closed).toBe(true)
  })

  it('flattens a full circle of two half arcs within tolerance', () => {
    // Round Corners' corner disc: centre (0.375, 1.625), r 0.25.
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0.5, y: 1.75 },
      { action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: true, sweep: false, x: 0.25, y: 1.5 },
      { action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: false, sweep: false, x: 0.5, y: 1.75 },
      { action: 'Z' },
    ] }
    const [sub] = flattenPath(path).subpaths
    expect(sub?.closed).toBe(true)
    expect(sub!.points.length).toBeGreaterThan(12)
    for (const p of sub!.points) {
      const r = Math.hypot(p.x - 0.375, p.y - 1.625)
      expect(Math.abs(r - 0.25)).toBeLessThanOrEqual(FLATTEN_TOLERANCE_IN)
    }
  })

  it('flattens quadratic and cubic curves through their control hull', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 },
      { action: 'Q', x1: 0.5, y1: 1, x: 1, y: 0 },
      { action: 'C', x1: 1.5, y1: -1, x2: 2.5, y2: -1, x: 3, y: 0 },
    ] }
    const [sub] = flattenPath(path).subpaths
    expect(sub?.closed).toBe(false)
    const ys = sub!.points.map(p => p.y)
    expect(Math.max(...ys)).toBeCloseTo(0.5, 2)   // quadratic peak at t=0.5 is y=0.5
    expect(Math.min(...ys)).toBeCloseTo(-0.75, 2) // cubic trough at t=0.5 is y=-0.75
  })

  it('starts a new subpath at a second M and drops degenerate ones', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 1, y: 0 },           // a line: two points, dropped
      { action: 'M', x: 0, y: 2 }, { action: 'L', x: 1, y: 2 }, { action: 'L', x: 1, y: 3 }, { action: 'Z' },
    ] }
    const subs = flattenPath(path).subpaths
    expect(subs).toHaveLength(1)
    expect(subs[0]?.closed).toBe(true)
  })

  it('treats a path whose last point equals its first as closed even without Z', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 1, y: 0 }, { action: 'L', x: 1, y: 1 }, { action: 'L', x: 0, y: 0 },
    ] }
    expect(flattenPath(path).subpaths[0]?.closed).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `flatten.ts`.**
  - Walk segments keeping `current` point. `M` starts a new subpath (flush the previous). `L` appends. `Z` closes and flushes. End of path flushes.
  - `A`: SVG endpoint-to-centre conversion (W3C SVG 1.1 appendix F.6.5). Inputs: current point, `rx ry rotate largeArc sweep x y`. Handle the radii-too-small correction (scale up). Zero radius or coincident endpoints: treat as a line. Sample `n = max(4, ceil(|dθ| / (2 * acos(1 - tol / rMax))))` points along the arc, excluding the start, including the end.
  - `Q` and `C`: recursive de Casteljau with flatness `tol`, or fixed subdivision `n = clamp(ceil(sqrt(hullLength / tol)), 4, 64)`. Either passes the test; recursive is more faithful.
  - Flush: remove consecutive duplicates (distance < 1e-9). If the last point equals the first within 1e-9, drop it and mark closed. Fewer than three distinct points after that and the subpath is dropped (open paths with two points are also dropped; this is what makes dimension lines fall out as `NO_OUTLINE`).
  - `flattenMaster(master, tol)` maps `flattenPath` over `master.paths` and drops paths that end up with no subpaths.

- [ ] **Step 4: Run, expect pass.**

### Task 1c: outline

- [ ] **Step 1: Write the failing tests** at `src/test/unit/imports/visio/outline.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { polygonArea, polygonBounds } from '@/lib/geometry/polygon-footprint'
import { flattenMaster } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { parseRaw } from '@/modules/imports/visio/raw-parser'

const doc = parseRaw(readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8'))
const master = (name: string) => doc.masters.find(m => m.name === name)!

describe('outlineOf', () => {
  it('unions five layers into one rounded rectangle', () => {
    const outline = outlineOf(flattenMaster(master('Round Corners')))!
    const b = polygonBounds(outline.footprint)
    expect(b.maxX - b.minX).toBeCloseTo(3.375, 3)
    expect(b.maxY - b.minY).toBeCloseTo(2.0, 3)
    // Bigger than the inner rectangle, smaller than the full box.
    const area = polygonArea(outline.footprint)
    expect(area).toBeGreaterThan(2.875 * 1.5)
    expect(area).toBeLessThan(3.375 * 2.0)
    expect(outline.detail).toHaveLength(0)
  })

  it('keeps the kidney as a single ring with the master colours', () => {
    const outline = outlineOf(flattenMaster(master('Freeform Kidney 11')))!
    expect(outline.footprint.length).toBeGreaterThan(20)
    expect(outline.fill).toMatch(/^#[0-9a-f]{6}$/)
    expect(outline.stroke).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('returns null for a master with nothing closed', () => {
    const house = parseRaw(readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8'))
    const dim = house.masters.find(m => m.name === 'Dimension Line 0')!
    expect(outlineOf(flattenMaster(dim))).toBeNull()
    expect(outlineOf([])).toBeNull()
  })

  it('falls back to closed stroke-only paths when nothing is filled', () => {
    const stroked = flattenMaster(master('Standard Rectangle')).map(p => ({ ...p, style: { ...p.style, fill: false, stroke: true } }))
    const outline = outlineOf(stroked)!
    expect(polygonBounds(outline.footprint).maxX).toBeCloseTo(3.125, 3)
  })

  it('picks the largest polygon as the footprint and keeps the rest as detail', () => {
    // Two separate squares: footprint is the big one, the small one is detail.
    const style = { fill: true, stroke: false, fillColor: '#123456', strokeColor: '#000000' }
    const sq = (x: number, s: number) => ({ points: [{ x, y: 0 }, { x: x + s, y: 0 }, { x: x + s, y: s }, { x, y: s }], closed: true })
    const outline = outlineOf([{ style, subpaths: [sq(0, 2), sq(5, 1)] }])!
    expect(polygonArea(outline.footprint)).toBeCloseTo(4, 6)
    expect(outline.detail).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `outline.ts`.**
  - Collect closed subpaths from paths with `style.fill`. If none, collect closed subpaths from paths with `style.stroke`. If still none, return null.
  - `union(...rings.map(r => [r.map(p => [p.x, p.y])]))` from `polygon-clipping` (`import polygonClipping from 'polygon-clipping'`; the default export has `union`). Result is a MultiPolygon: `Polygon[]` where `Polygon = Ring[]`, ring 0 is the outer, others holes, and the first point is repeated at the end: drop it.
  - Footprint: the outer ring with the largest `|polygonArea|`. Detail: every other outer ring and every hole. Read `normalizePolygon` in `polygon-footprint.ts` first; if it fixes orientation, run the footprint through it rather than writing a second orientation routine.
  - Colours: the first filled path's `fillColor` (or `DEFAULT_FILL`), the first stroked path's `strokeColor` (or `DEFAULT_STROKE`). Validate with `/^#[0-9a-f]{6}$/`.

- [ ] **Step 4: Run, expect pass.**

### Task 1d: scale, classify, thumbnail

- [ ] **Step 1: Write the failing tests**

`src/test/unit/imports/visio/scale.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeRings, scaleRings } from '@/modules/imports/visio/scale'
import { VISIO_SCALE_DEFAULT } from '@/modules/imports/visio/types'

describe('scale', () => {
  const rect = [[{ x: 0.25, y: 0.5 }, { x: 3.375, y: 0.5 }, { x: 3.375, y: 2 }, { x: 0.25, y: 2 }]]

  it('moves the bounding box to the origin', () => {
    const n = normalizeRings(rect)
    expect(n.rings[0]?.[0]).toEqual({ x: 0, y: 0 })
    expect(n.widthIn).toBeCloseTo(3.125, 9)
    expect(n.heightIn).toBeCloseTo(1.5, 9)
  })

  it('turns the Standard Rectangle into 25 by 12 feet', () => {
    const s = scaleRings(normalizeRings(rect).rings, VISIO_SCALE_DEFAULT)
    expect(s.widthIn).toBeCloseTo(300, 6)
    expect(s.heightIn).toBeCloseTo(144, 6)
    expect(s.rings[0]).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 144 }, { x: 0, y: 144 }])
  })

  it('normalizes against the footprint, not the detail', () => {
    const detail = [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 11, y: 11 }]
    const n = normalizeRings([...rect, detail])
    expect(n.widthIn).toBeCloseTo(3.125, 9)
    expect(n.rings[1]?.[0]).toEqual({ x: 9.75, y: 9.5 })
  })
})
```

`src/test/unit/imports/visio/classify.test.ts`:
```ts
import { ShapeKind, StencilCategory } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { classifyMaster } from '@/modules/imports/visio/classify'

describe('classifyMaster', () => {
  it.each([
    ['Standard Rectangle', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Freeform Kidney 11', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Grecian Master', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Round Corners', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Standard Steps', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Tan Ledge 5x5', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Swim Out Bench', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Bubbler', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Guard Alarm', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Drains', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Call Out', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['6X6 Spa.39', 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SPA],
    ["6'x6' Grecian Spa", 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SPA],
    ["Spillway 4'", 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ["2'Waterfall", 'Pool.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ['36" Copper Fire Bowl', 'House&Deck.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ['House', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.SKETCH_PATH],
    ['Grass', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.GRASS_AREA],
    ['Concrete Lanai', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.CONCRETE_DECK],
    ['Paver Lanai', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.PAVER_DECK],
    ["Raised Deck 6'", 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.CONCRETE_DECK],
    ['Pillar', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.SKETCH_PATH],
    ['Child Safety Fence', 'House&Deck.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Untitled master 3', 'Anything.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
  ])('%s in %s', (name, file, category, kind) => {
    expect(classifyMaster(name, file)).toEqual({ category, shapeKind: kind })
  })
})
```

`src/test/unit/imports/visio/thumbnail.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { thumbnailSvg } from '@/modules/imports/visio/thumbnail'

describe('thumbnailSvg', () => {
  const ring = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1.5 }, { x: 0, y: 1.5 }]

  it('is a standalone svg with the rings as one path', () => {
    const svg = thumbnailSvg([ring], '#00ffff', '#000000')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('viewBox="0 0 3 1.5"')
    expect(svg).toContain('fill="#00ffff"')
    expect(svg).toContain('stroke="#000000"')
    expect(svg).toContain('vector-effect="non-scaling-stroke"')
    expect(svg).toMatch(/d="M0 0 ?L3 0 ?L3 1\.5 ?L0 1\.5 ?Z"/)
  })

  it('refuses colours that are not six-digit hex', () => {
    const svg = thumbnailSvg([ring], 'url(javascript:alert(1))', '"onload="x')
    expect(svg).not.toContain('javascript')
    expect(svg).not.toContain('onload')
  })

  it('pads a hairline so a one-dimensional ring still has a viewBox with area', () => {
    const svg = thumbnailSvg([[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }]], '#000000', '#000000')
    expect(svg).not.toContain('viewBox="0 0 2 0"')
  })
})
```

- [ ] **Step 2: Run all three, expect failure.**

- [ ] **Step 3: Implement.**
  - `scale.ts`: bounds of `rings[0]` only; translate every ring by `(-minX, -minY)`; `scaleRings` multiplies and recomputes width/height from the footprint. Round to 6 decimals to keep JSON short.
  - `classify.ts`: an ordered table `const RULES: { test: RegExp; file?: RegExp; category; shapeKind }[]`, first match wins, checked against the lower-cased name; `file` when present must also match the lower-cased file name. Order: spas (`/\bspa\b|spa\./`) before pools; `grecian|roman|rectangle|kidney|freeform|corners|lazy|oval|master$` with `file: /pool/` for pools; `grass` to GRASS_AREA; `paver` to PAVER_DECK; `lanai|deck|concrete|patio` to CONCRETE_DECK; `house|roof|pillar|pedestal|door|stair|stepping|wall` to DECK_HOUSE + SKETCH_PATH; `step|ledge|bench|shelf|stool|jet|bubbler|seat|swim out|umbrella` to INTERIOR_FEATURE + SKETCH_PATH; `spillway|waterfall|\bwf\b|bowl|fire|fountain|return` to WATER_OUTDOOR + SKETCH_PATH; `alarm|drain|light|call out|fence|clearview|arrow|check|\bco\b|dimension` to CONSTRUCTION_SYMBOL + SKETCH_PATH. Default: CONSTRUCTION_SYMBOL + SKETCH_PATH. Every test row above must pass; add rules rather than special cases.
  - `thumbnail.ts`: viewBox from the bounds of all rings, padded to at least 0.05 in each dimension when degenerate; one `<path>` with all rings as subpaths (`M x y L ... Z`), `fill-rule="evenodd"`, `stroke-width="0.01"`, `vector-effect="non-scaling-stroke"`. Colour validation: `/^#[0-9a-f]{6}$/i` else `DEFAULT_FILL`/`DEFAULT_STROKE`. Numbers formatted with up to 4 decimals and no trailing zeros.

- [ ] **Step 4: Run, expect pass.**

### Task 1e: pipeline and properties

- [ ] **Step 1: Write the failing tests**

`src/test/unit/imports/visio/pipeline.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { ShapeKind, StencilCategory } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { polygonArea } from '@/lib/geometry/polygon-footprint'
import { flattenMaster } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { previewFromRaw } from '@/modules/imports/visio/pipeline'
import { parseRaw } from '@/modules/imports/visio/raw-parser'
import { scaleRings } from '@/modules/imports/visio/scale'
import { FLATTEN_TOLERANCE_IN, SkipReason, StoredCandidateSchema, VISIO_SCALE_DEFAULT } from '@/modules/imports/visio/types'

const POOL = readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8')
const HOUSE = readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8')

describe('previewFromRaw on Pool.vss', () => {
  const result = previewFromRaw(POOL, { fileName: 'Pool.vss' })

  it('keeps 44 of 50 masters and says why the rest are out', () => {
    expect(result.candidates).toHaveLength(44)
    expect(result.skipped.map(s => [s.name, s.reason])).toEqual(
      expect.arrayContaining([
        ['SOB Text', SkipReason.TEXT_ONLY],
        ['Tan Ledge 8 Font', SkipReason.TEXT_ONLY],
        ["3' WD", SkipReason.NO_OUTLINE],
      ]),
    )
    expect(result.candidates.length + result.skipped.length).toBe(50)
  })

  it('every candidate validates against the stored schema', () => {
    for (const c of result.candidates) expect(() => StoredCandidateSchema.parse(c)).not.toThrow()
  })

  it('Standard Rectangle is a 25 by 12 foot polygon pool', () => {
    const rect = result.candidates.find(c => c.name === 'Standard Rectangle')!
    expect(rect.category).toBe(StencilCategory.POOL_SHAPE)
    expect(rect.shapeKind).toBe(ShapeKind.POLYGON_POOL)
    const real = scaleRings(rect.rings, VISIO_SCALE_DEFAULT)
    expect(real.widthIn).toBeCloseTo(300, 3)
    expect(real.heightIn).toBeCloseTo(144, 3)
    expect(real.rings[0]).toHaveLength(4)
  })

  it('Round Corners is one ring, 27 by 16 feet', () => {
    const rc = result.candidates.find(c => c.name === 'Round Corners')!
    expect(rc.ringCount).toBe(1)
    const real = scaleRings(rc.rings, VISIO_SCALE_DEFAULT)
    expect(real.widthIn).toBeCloseTo(324, 2)
    expect(real.heightIn).toBeCloseTo(192, 2)
  })

  it('the kidney area has converged at the default tolerance', () => {
    const master = parseRaw(POOL).masters.find(m => m.name === 'Freeform Kidney 11')!
    const coarse = polygonArea(outlineOf(flattenMaster(master, FLATTEN_TOLERANCE_IN))!.footprint)
    const fine = polygonArea(outlineOf(flattenMaster(master, FLATTEN_TOLERANCE_IN / 10))!.footprint)
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.01)
  })

  it('keeps the original name and a thumbnail on every candidate', () => {
    const jets = result.candidates.find(c => c.name === 'Deck Jets (5)')!
    expect(jets.thumbnailSvg).toContain('<svg')
    expect(jets.index).toBe(26)
  })
})

describe('previewFromRaw on the House&Deck excerpt', () => {
  const result = previewFromRaw(HOUSE, { fileName: 'House&Deck.vss' })
  it('skips the raster and the dimension line, keeps the rest', () => {
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'R_Concrete', reason: SkipReason.RASTER }),
      expect.objectContaining({ name: 'Dimension Line 0', reason: SkipReason.NO_OUTLINE }),
    ]))
    expect(result.candidates.map(c => c.name)).toEqual(expect.arrayContaining(['House', 'Grass', 'Concrete Lanai', 'Raised Deck']))
    expect(result.candidates.find(c => c.name === 'Grass')?.shapeKind).toBe(ShapeKind.GRASS_AREA)
  })
})
```

`src/test/property/visio-geometry.property.test.ts`:
```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { polygonBounds } from '@/lib/geometry/polygon-footprint'
import { flattenPath } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { normalizeRings, scaleRings } from '@/modules/imports/visio/scale'
import { FLATTEN_TOLERANCE_IN, type RawPath } from '@/modules/imports/visio/types'

const style = { fill: true, stroke: false, fillColor: '#00ffff', strokeColor: '#000000' }
const coord = fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })

describe('visio geometry properties', () => {
  it('every flattened arc point lies on the circle within tolerance', () => {
    fc.assert(fc.property(
      fc.record({ cx: coord, cy: coord, r: fc.double({ min: 0.05, max: 3, noNaN: true }), a0: fc.double({ min: 0, max: 6.283, noNaN: true }), sweep: fc.boolean(), large: fc.boolean() }),
      ({ cx, cy, r, a0, sweep, large }) => {
        const a1 = a0 + (large ? 4 : 2) // radians past the start, over or under pi
        const start = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }
        const end = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }
        const path: RawPath = { style, segments: [
          { action: 'M', ...start },
          { action: 'A', rx: r, ry: r, rotate: 0, largeArc: large, sweep, x: end.x, y: end.y },
          { action: 'L', x: cx, y: cy }, { action: 'Z' },
        ] }
        const sub = flattenPath(path).subpaths[0]
        if (!sub) return true
        return sub.points.slice(0, -1).every(p => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) <= FLATTEN_TOLERANCE_IN + 1e-9)
      },
    ), { numRuns: 200 })
  })

  it('the union never grows past the inputs bounding box', () => {
    const square = fc.record({ x: coord, y: coord, s: fc.double({ min: 0.1, max: 2, noNaN: true }) })
    fc.assert(fc.property(fc.array(square, { minLength: 1, maxLength: 6 }), squares => {
      const subpaths = squares.map(({ x, y, s }) => ({ closed: true, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }] }))
      const outline = outlineOf([{ style, subpaths }])
      if (!outline) return false
      const all = polygonBounds(subpaths.flatMap(s => s.points))
      const got = polygonBounds([outline.footprint, ...outline.detail].flat())
      const eps = 1e-6
      return got.minX >= all.minX - eps && got.minY >= all.minY - eps && got.maxX <= all.maxX + eps && got.maxY <= all.maxY + eps
    }), { numRuns: 200 })
  })

  it('scale then unscale is the identity', () => {
    const ring = fc.array(fc.record({ x: coord, y: coord }), { minLength: 3, maxLength: 12 })
    fc.assert(fc.property(ring, fc.double({ min: 1, max: 1200, noNaN: true }), (points, k) => {
      const n = normalizeRings([points])
      const back = scaleRings(scaleRings(n.rings, k).rings, 1 / k)
      return back.rings[0]!.every((p, i) => Math.abs(p.x - n.rings[0]![i]!.x) < 1e-6 && Math.abs(p.y - n.rings[0]![i]!.y) < 1e-6)
    }), { numRuns: 200 })
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `pipeline.ts`.** For each master of `parseRaw(raw)`: if `paths.length === 0` and `graphicObjects > 0` skip `RASTER`; if `paths.length === 0` and `textObjects > 0` skip `TEXT_ONLY`; `outlineOf(flattenMaster(master))` null skips `NO_OUTLINE` (also covers `paths.length === 0` with neither text nor pictures). Otherwise `normalizeRings([footprint, ...detail])`, `classifyMaster(name, fileName)`, `thumbnailSvg(normalized.rings, fill, stroke)`, candidate `{ index, name, category, shapeKind, drawingWidthIn, drawingHeightIn, ringCount: rings.length, thumbnailSvg, fill, stroke, rings }`. Validate each candidate with `StoredCandidateSchema.parse` so a bug here fails loudly rather than storing junk. `scaleRings` rounding must not move the Standard Rectangle's corners off integers, so round to 6 decimals, not fewer.

- [ ] **Step 4: Run every test in `src/test/unit/imports/visio/` and the property file, expect pass. Then `pnpm typecheck && pnpm lint`.**

---

## Task 2: sniff, converter process, upload route

**Files:**
- Create: `src/modules/imports/visio/sniff.ts`
- Create: `src/modules/imports/visio/convert.ts`
- Create: `src/app/api/imports/visio/route.ts`
- Modify: `.env.example` (`VISIO_CONVERTER_BIN=""`)
- Test: `src/test/unit/imports/visio/sniff.test.ts`, `src/test/unit/imports/visio/convert.test.ts`, `src/test/unit/imports/visio/visio-route.test.ts`

**Interfaces:**
- Consumes: `types.ts`; `previewFromRaw` from `pipeline.ts` (a stub until Task 1 merges; `convert.test.ts` therefore tests `runConverter` and the seam, not geometry); `stageUpload`/`discardStagedUpload` from `src/modules/imports/ingest/staging.ts`; `logIngestFailure` from `src/modules/imports/ingest/errors.ts`; `dispatchCommand` from `src/modules/commands/dispatch.ts`; `getSession`/`getOrgId` from `src/modules/auth/session.ts`.
- Produces:

```ts
// sniff.ts
export const OLE2_SIGNATURE: Buffer   // d0 cf 11 e0 a1 b1 1a e1
export const ZIP_SIGNATURE: Buffer    // 50 4b 03 04
export function sniffVisio(bytes: Buffer): VisioContainer | null

// convert.ts
export class ConverterMissingError extends Error {}
export class ConverterFailedError extends Error { readonly ref: string }
/** Spawns the binary on a temp file. Rejects with the two errors above and nothing else. */
export function runConverter(bytes: Buffer, opts?: { bin?: string; timeoutMs?: number }): Promise<string>
export type StencilConverter = (bytes: Buffer, fileName: string) => Promise<ConversionResult>
/** The default: `runConverter` then `previewFromRaw`. */
export const convertStencilFile: StencilConverter
/** Test seam. `null` restores the default. */
export function setStencilConverter(fn: StencilConverter | null): void
export function getStencilConverter(): StencilConverter
```

- [ ] **Step 1: Write the failing tests**

`sniff.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { sniffVisio } from '@/modules/imports/visio/sniff'
import { VisioContainer } from '@/modules/imports/visio/types'

describe('sniffVisio', () => {
  it('recognises an OLE2 compound document (.vss)', () => {
    expect(sniffVisio(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]))).toBe(VisioContainer.OLE2)
  })
  it('recognises a zip (.vssx)', () => {
    expect(sniffVisio(Buffer.from('PK\u0003\u0004rest of the file', 'latin1'))).toBe(VisioContainer.ZIP)
  })
  it('refuses a PNG renamed .vss, an empty buffer and a short header', () => {
    expect(sniffVisio(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBeNull()
    expect(sniffVisio(Buffer.alloc(0))).toBeNull()
    expect(sniffVisio(Buffer.from([0xd0, 0xcf]))).toBeNull()
  })
})
```

`convert.test.ts` (a tiny shell script stands in for the binary so the process path is real without `vss2raw`):
```ts
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConverterFailedError, ConverterMissingError, getStencilConverter, runConverter, setStencilConverter } from '@/modules/imports/visio/convert'
import { ERROR_REF_PATTERN } from '@/modules/imports/ingest/errors'

function script(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'visio-convert-'))
  const path = join(dir, 'fake-vss2raw')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('runConverter', () => {
  afterEach(() => setStencilConverter(null))

  it('hands the file path to the binary and returns its stdout', async () => {
    const bin = script('printf "startDocument()\\n"; wc -c < "$1"')
    const out = await runConverter(Buffer.from('twelve bytes'), { bin })
    expect(out.startsWith('startDocument()')).toBe(true)
    expect(out).toContain('12')
  })

  it('reports a missing binary as ConverterMissingError', async () => {
    await expect(runConverter(Buffer.from('x'), { bin: '/nonexistent/vss2raw' })).rejects.toBeInstanceOf(ConverterMissingError)
  })

  it('reports a non-zero exit as ConverterFailedError with a ref and without stderr', async () => {
    const bin = script('echo "secret path /Users/someone/file" >&2; exit 3')
    const err = await runConverter(Buffer.from('x'), { bin }).catch(e => e)
    expect(err).toBeInstanceOf(ConverterFailedError)
    expect(err.ref).toMatch(ERROR_REF_PATTERN)
    expect(String(err.message)).not.toContain('/Users/someone')
  })

  it('kills a hung converter after the timeout', async () => {
    const bin = script('sleep 5')
    await expect(runConverter(Buffer.from('x'), { bin, timeoutMs: 200 })).rejects.toBeInstanceOf(ConverterFailedError)
  })

  it('the seam replaces the default and null restores it', async () => {
    const fake = async () => ({ candidates: [], skipped: [] })
    setStencilConverter(fake)
    expect(getStencilConverter()).toBe(fake)
    setStencilConverter(null)
    expect(getStencilConverter()).not.toBe(fake)
  })
})
```

`visio-route.test.ts` (mirror `src/test/unit/capture/capture-route.test.ts` for the session mock; the route must never run a converter, so the seam returns a fixed result):
```ts
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ShapeKind, StencilCategory } from '@prisma/client'

vi.mock('@/modules/auth/session', () => ({
  getSession: async () => ({ user: { id: 'user-route-test', orgId: 'org-route-test' } }),
  getOrgId: (s: { user: { orgId: string } }) => s.user.orgId,
}))

import { db } from '@/lib/db'
import { setStencilConverter } from '@/modules/imports/visio/convert'
import { VISIO_UPLOAD_FIELD, VisioMessage } from '@/modules/imports/visio/types'

let reachable = false
try { await db.$queryRaw`SELECT 1`; reachable = true } catch { console.warn('visio route tests skipped: local Postgres unreachable') }

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])

function multipart(bytes: Buffer, name: string, extra: Record<string, string> = {}): Request {
  const form = new FormData()
  form.append(VISIO_UPLOAD_FIELD, new Blob([bytes]), name)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return new Request('http://localhost/api/imports/visio', { method: 'POST', body: form })
}

describe.skipIf(!reachable)('POST /api/imports/visio', () => {
  let POST: (req: Request) => Promise<Response>
  beforeAll(async () => {
    await db.organization.upsert({ where: { id: 'org-route-test' }, update: {}, create: { id: 'org-route-test', name: 'Route test org' } })
    await db.user.upsert({ where: { id: 'user-route-test' }, update: {}, create: { id: 'user-route-test', email: 'visio-route@poolforge.test', name: 'Route' } })
    ;({ POST } = await import('@/app/api/imports/visio/route'))
  })
  afterEach(() => setStencilConverter(null))

  it('refuses something that is not a stencil before converting', async () => {
    let called = false
    setStencilConverter(async () => { called = true; return { candidates: [], skipped: [] } })
    const res = await POST(multipart(Buffer.from('not a visio file at all'), 'x.vss'))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe(VisioMessage.NOT_A_STENCIL)
    expect(called).toBe(false)
  })

  it('refuses a non-multipart body', async () => {
    const res = await POST(new Request('http://localhost/api/imports/visio', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(415)
  })

  it('stages, dispatches the preview command and returns the preview', async () => {
    setStencilConverter(async () => ({
      skipped: [],
      candidates: [{
        index: 0, name: 'Standard Rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL,
        drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000',
        rings: [[{ x: 0, y: 0 }, { x: 3.125, y: 0 }, { x: 3.125, y: 1.5 }, { x: 0, y: 1.5 }]],
      }],
    }))
    const res = await POST(multipart(OLE2, 'Pool.vss'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.fileName).toBe('Pool.vss')
    expect(body.data.candidates[0].name).toBe('Standard Rectangle')
    expect(body.data.candidates[0].rings).toBeUndefined()
    const row = await db.stencilImport.findUnique({ where: { id: body.data.importId } })
    expect(row?.orgId).toBe('org-route-test')
    const audit = await db.commandAuditLog.findFirst({ where: { orgId: 'org-route-test', commandId: 'stencil.library.preview' }, orderBy: { createdAt: 'desc' } })
    expect(audit).not.toBeNull()
  })
})
```
  The last test needs Task 3's command in the same tree; Tasks 2 and 3 share a worktree, so it passes before hand-off.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.**
  - `sniff.ts`: compare the first 8 bytes to `OLE2_SIGNATURE`, the first 4 to `ZIP_SIGNATURE`. Anything shorter than 8 bytes is null.
  - `convert.ts`: `mkdtemp` under `os.tmpdir()`, write `stencil.vss`, `execFile(bin, [path], { timeout, maxBuffer: CONVERTER_MAX_OUTPUT_BYTES, encoding: 'utf8' })` via `promisify`. `bin` defaults to `process.env[VISIO_CONVERTER_BIN_ENV]?.trim() || VISIO_CONVERTER_DEFAULT_BIN`. On `ENOENT` throw `ConverterMissingError`. On any other failure (non-zero exit, timeout `killed`, maxBuffer) call `logIngestFailure('visio.convert', { code, signal, stderr: String(stderr).slice(0, 2000) })` and throw `ConverterFailedError(ref)` whose message is `${VisioMessage.CONVERT_FAILED} (ref ${ref}).`. Always remove the temp dir in `finally`. `convertStencilFile = async (bytes, fileName) => previewFromRaw(await runConverter(bytes), { fileName })`.
  - `route.ts`: copy the structure of `src/app/api/imports/upload/route.ts` (session check 401, content type 415, `readCapped` with `MAX_VISIO_BYTES + 64KB`, `formData()`), take exactly one `VISIO_UPLOAD_FIELD` blob (missing: 400 'No file was attached.'; size 0: 400 `VisioMessage.EMPTY`; over cap: 413 `VisioMessage.TOO_LARGE`), `sniffVisio` null: 415 `VisioMessage.NOT_A_STENCIL`, `fileName` = the optional `fileName` form field else the blob's `name` else `stencil.vss`, trimmed to 255 and stripped of path separators. Then `stageUpload({ bytes, declaredMimeType, orgId })`, `dispatchCommand(LibraryCommand.PREVIEW, { uploadRef, fileName }, ctx)`, `discardStagedUpload` in `finally`. Map `result.ok` to 200 `{ ok: true, data }`; errors: message equal to `VisioMessage.CONVERTER_MISSING` to 503, message starting with `VisioMessage.CONVERT_FAILED` to 422, `VisioMessage.NO_MASTERS` to 422, anything else 400. `Cache-Control: no-store` on every response. Export `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
  - `.env.example`: `VISIO_CONVERTER_BIN=""` with a two-line comment (empty means `vss2raw` on PATH; the production image installs libvisio-tools).

- [ ] **Step 4: Run `sniff.test.ts` and `convert.test.ts`, expect pass. `pnpm typecheck && pnpm lint`.**

---

## Task 3: the five commands

**Files:**
- Create: `src/modules/commands/categories/stencil-library.ts`
- Modify: `src/modules/commands/init.ts` (add `import './categories/stencil-library'`)
- Modify: `src/test/unit/commands.test.ts` only if it enumerates every id (read it first)
- Regenerate: `docs/commands.md` via `pnpm docs:commands`
- Test: `src/test/unit/imports/visio/library-commands.test.ts` (real Postgres)

**Interfaces:**
- Consumes: `types.ts` schemas and `LibraryCommand`; `getStencilConverter` from `convert.ts` (Task 2, same worktree); `sniffVisio`; `takeStagedUpload` from staging; `scaleRings` from `scale.ts` (Task 1, other worktree: until it merges, implement commit's scaling as a private `scaleStored(rings, k)` with the frozen `Normalized` shape, multiply every coordinate and take width and height from the first ring's bounds; the controller swaps it for the import in Task 5).
- Produces: five registered commands with these exact ids and schemas:

| id | runsOn | inputSchema | outputSchema | voiceExamples |
|---|---|---|---|---|
| `stencil.library.preview` | server | `PreviewInputSchema` | `PreviewOutputSchema` | none |
| `stencil.library.commit` | server | `CommitInputSchema` | `CommitOutputSchema` | none |
| `stencil.library.list` | server | `z.object({})` | `ListOutputSchema` | `['What is in my stencil library?']` |
| `stencil.library.place` | client | `PlaceInputSchema` | `PlaceOutputSchema` | `['Drop my kidney pool here.']` |
| `stencil.library.delete` | server | `DeleteInputSchema` | `DeleteOutputSchema` | none |

All `category: 'template'`. `db` imported lazily inside `execute` like `scene-template.ts` does.

- [ ] **Step 1: Write the failing test** at `src/test/unit/imports/visio/library-commands.test.ts`

```ts
import { randomUUID } from 'node:crypto'
import { ShapeKind, StencilCategory } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import { stageUpload } from '@/modules/imports/ingest/staging'
import { setStencilConverter } from '@/modules/imports/visio/convert'
import {
  LibraryCommand, VISIO_SCALE_DEFAULT, VisioMessage,
  type CommitOutput, type ListOutput, type PlaceOutput, type PreviewOutput, type StoredCandidate,
} from '@/modules/imports/visio/types'

const RUN = randomUUID().slice(0, 8)
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])

let reachable = false
try { await db.$queryRaw`SELECT 1`; reachable = true } catch { console.warn('library command tests skipped: local Postgres unreachable (port 5434)') }

const rect: StoredCandidate = {
  index: 0, name: `Standard Rectangle ${RUN}`, category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL,
  drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000',
  rings: [[{ x: 0, y: 0 }, { x: 3.125, y: 0 }, { x: 3.125, y: 1.5 }, { x: 0, y: 1.5 }]],
}
const alarm: StoredCandidate = { ...rect, index: 1, name: `Guard Alarm ${RUN}`, category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, drawingWidthIn: 0.125, drawingHeightIn: 0.125,
  rings: [[{ x: 0, y: 0 }, { x: 0.125, y: 0 }, { x: 0.125, y: 0.125 }, { x: 0, y: 0.125 }]] }

describe.skipIf(!reachable)('stencil library commands', () => {
  let orgA = '', orgB = '', userId = ''
  const ctxA = () => ({ userId, orgId: orgA })
  const ctxB = () => ({ userId, orgId: orgB })

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Library A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Library B ${RUN}` } })).id
    userId = (await db.user.create({ data: { email: `library-${RUN}@poolforge.test`, name: 'Owner' } })).id
    setStencilConverter(async () => ({ candidates: [rect, alarm], skipped: [{ index: 2, name: 'SOB Text', reason: 'TEXT_ONLY' }] }))
  })
  afterEach(async () => { await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } }) })
  afterAll(async () => {
    setStencilConverter(null)
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  async function preview(ctx = ctxA()): Promise<PreviewOutput> {
    const uploadRef = stageUpload({ bytes: OLE2, declaredMimeType: null, orgId: ctx.orgId })
    const r = await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef, fileName: 'Pool.vss' }, ctx)
    if (!r.ok) throw new Error(r.error)
    return r.data as PreviewOutput
  }

  it('registers all five, none a stub, preview and commit silent to voice', () => {
    for (const id of Object.values(LibraryCommand)) {
      const cmd = get(id)
      expect(cmd, id).toBeDefined()
      expect(cmd?.unimplemented, id).toBeUndefined()
      expect(cmd?.category).toBe('template')
    }
    expect(get(LibraryCommand.PREVIEW)?.voiceExamples).toBeUndefined()
    expect(get(LibraryCommand.COMMIT)?.voiceExamples).toBeUndefined()
    expect(get(LibraryCommand.PLACE)?.runsOn).toBe('client')
  })

  it('preview stores a pending import and returns candidates without rings', async () => {
    const p = await preview()
    expect(p.candidates.map(c => c.name)).toEqual([rect.name, alarm.name])
    expect((p.candidates[0] as { rings?: unknown }).rings).toBeUndefined()
    expect(p.skipped[0]?.reason).toBe('TEXT_ONLY')
    expect(p.scaleInchesPerInch).toBe(VISIO_SCALE_DEFAULT)
    const row = await db.stencilImport.findUniqueOrThrow({ where: { id: p.importId } })
    expect(row.status).toBe('PENDING')
    expect(row.orgId).toBe(orgA)
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('preview refuses a ref staged under another org and bytes that are not a stencil', async () => {
    const foreign = stageUpload({ bytes: OLE2, declaredMimeType: null, orgId: orgB })
    expect((await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef: foreign, fileName: 'Pool.vss' }, ctxA())).ok).toBe(false)
    const png = stageUpload({ bytes: Buffer.from('not a stencil'), declaredMimeType: null, orgId: orgA })
    const r = await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef: png, fileName: 'x.vss' }, ctxA())
    expect((r as { error: string }).error).toBe(VisioMessage.NOT_A_STENCIL)
  })

  it('commit scales, writes org-scoped rows, and reports created', async () => {
    const p = await preview()
    const r = await dispatchCommand(LibraryCommand.COMMIT, {
      importId: p.importId, scaleInchesPerInch: VISIO_SCALE_DEFAULT,
      items: p.candidates.map(c => ({ index: c.index, include: true, name: c.name, category: c.category, shapeKind: c.shapeKind })),
    }, ctxA())
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    const data = r.data as CommitOutput
    expect(data.created).toBe(2)
    expect(data.replaced).toBe(0)
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    expect(row.widthIn).toBeCloseTo(300, 6)
    expect(row.heightIn).toBeCloseTo(144, 6)
    expect(row.rings).toEqual([[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 144 }, { x: 0, y: 144 }]])
    expect(row.source).toBe('VISIO_IMPORT')
    expect(row.sourceFile).toBe('Pool.vss')
    expect(row.sourceMaster).toBe(rect.name)
    expect((await db.stencilImport.findUniqueOrThrow({ where: { id: p.importId } })).status).toBe('COMMITTED')
    const audit = await db.commandAuditLog.findFirst({ where: { orgId: orgA, commandId: LibraryCommand.COMMIT } })
    expect(audit?.userId).toBe(userId)
  })

  it('a second import of the same name replaces, and commit twice is refused', async () => {
    const p = await preview()
    const items = [{ index: 0, include: true, name: rect.name, category: rect.category, shapeKind: rect.shapeKind }]
    const first = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 48, items }, ctxA())
    expect(first.ok).toBe(true)
    expect((first as { data: CommitOutput }).data.replaced).toBe(1)
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    expect(row.widthIn).toBeCloseTo(150, 6) // the new scale won
    const again = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 48, items }, ctxA())
    expect(again.ok).toBe(false)
    expect((again as { error: string }).error).toBe(VisioMessage.ALREADY_COMMITTED)
  })

  it('commit refuses two included items with one name, nothing written', async () => {
    const p = await preview()
    const before = await db.orgStencil.count({ where: { orgId: orgA } })
    const r = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [
      { index: 0, include: true, name: `Twin ${RUN}`, category: rect.category, shapeKind: rect.shapeKind },
      { index: 1, include: true, name: `Twin ${RUN}`, category: alarm.category, shapeKind: alarm.shapeKind },
    ] }, ctxA())
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain(`Twin ${RUN}`)
    expect(await db.orgStencil.count({ where: { orgId: orgA } })).toBe(before)
  })

  it("commit refuses nothing selected, an unknown index and another org's import", async () => {
    const p = await preview()
    const none = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 0, include: false, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxA())
    expect((none as { error: string }).error).toBe(VisioMessage.NOTHING_SELECTED)
    const bad = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 99, include: true, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxA())
    expect(bad.ok).toBe(false)
    const other = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 0, include: true, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.EXPIRED)
  })

  it('list is per org and carries no rings', async () => {
    const a = await dispatchCommand(LibraryCommand.LIST, {}, ctxA())
    const b = await dispatchCommand(LibraryCommand.LIST, {}, ctxB())
    expect((a as { data: ListOutput }).data.stencils.map(s => s.name)).toContain(rect.name)
    expect((b as { data: ListOutput }).data.stencils).toEqual([])
    expect((a as { data: ListOutput }).data.stencils[0]).not.toHaveProperty('rings')
  })

  it('place returns the geometry for the client and refuses other orgs', async () => {
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    const r = await dispatchCommand(LibraryCommand.PLACE, { orgStencilId: row.id, x: 120, y: 240 }, ctxA())
    expect(r.ok).toBe(true)
    const d = (r as { data: PlaceOutput }).data
    expect(d.shapeKind).toBe(ShapeKind.POLYGON_POOL)
    expect(d.points).toHaveLength(4)
    expect(d.width).toBeCloseTo(150, 6)
    expect(d.shapeId).toBe('client-pending')
    const other = await dispatchCommand(LibraryCommand.PLACE, { orgStencilId: row.id, x: 0, y: 0 }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.NOT_FOUND)
  })

  it("delete removes only the caller's row", async () => {
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: alarm.name } } })
    const other = await dispatchCommand(LibraryCommand.DELETE, { orgStencilId: row.id }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.NOT_FOUND)
    const mine = await dispatchCommand(LibraryCommand.DELETE, { orgStencilId: row.id }, ctxA())
    expect(mine.ok).toBe(true)
    expect(await db.orgStencil.findUnique({ where: { id: row.id } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `stencil-library.ts`.**
  - Shared `notAuthenticated` helper as in `scene-template.ts`.
  - **preview**: `takeStagedUpload(uploadRef, ctx.orgId)` null: `VisioMessage.EXPIRED`. `sniffVisio` null: `VisioMessage.NOT_A_STENCIL` (the route checks too; the command is the boundary). `getStencilConverter()(bytes, fileName)`: `ConverterMissingError` to `VisioMessage.CONVERTER_MISSING`; `ConverterFailedError` to its message; any other throw to `logIngestFailure('stencil.library.preview', err)` and `${VisioMessage.CONVERT_FAILED} (ref ${ref}).`. Empty candidates: `VisioMessage.NO_MASTERS`. Create `StencilImport { orgId, fileName, scaleInchesPerInch: input.scaleInchesPerInch ?? VISIO_SCALE_DEFAULT, candidatesJson: candidates, skippedJson: skipped, createdBy: existing user id or null, expiresAt: now + STENCIL_IMPORT_TTL_MS }`. Return candidates mapped through `CandidateSchema.parse` (strips rings).
  - **commit**: load import `findFirst({ where: { id, orgId } })`; missing or `expiresAt <= now`: `VisioMessage.EXPIRED`; status COMMITTED: `VisioMessage.ALREADY_COMMITTED`. Included items empty: `NOTHING_SELECTED`. Duplicate names among included (trimmed, case-sensitive): `Two stencils are both called "${name}". Give one a different name.` Parse `candidatesJson` with `z.array(StoredCandidateSchema)`; an item whose index has no candidate: `That stencil is not in this import.` One `findMany({ where: { orgId, name: { in } }, select: { name } })` before the loop decides `replaced`. For each included item: scale rings, `upsert({ where: { orgId_name: { orgId, name } }, create: {...}, update: {...} })`. All writes inside `db.$transaction` including the status update to COMMITTED. Return summaries (`updatedAt.toISOString()`).
  - **list**: `findMany({ where: { orgId }, orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }], select: everything but rings })`.
  - **place**: `runsOn: 'client'`; server `execute` loads `findFirst({ where: { id: orgStencilId, orgId } })` else `VisioMessage.NOT_FOUND`; parse `rings` with `z.array(RingSchema)`; return `{ shapeKind, name, width: widthIn, height: heightIn, points: rings[0], shapeId: 'client-pending' }`. The client handler is Task 4's.
  - **delete**: `deleteMany({ where: { id, orgId } })`; count 0: `VisioMessage.NOT_FOUND`; else `{ deleted: true }`.
  - Add the import line to `init.ts` after `'./categories/template'`. Run `pnpm docs:commands`.

- [ ] **Step 4: Run the test (with `DATABASE_URL` on 5434), then `pnpm vitest run src/test/unit/commands` to see the catalog and wiring tests. The wiring test WILL fail with `stencil.library.place` missing a handler until Task 4 merges; that is expected and is reported, not fixed here. `pnpm typecheck && pnpm lint`.**

---

## Task 4: panel, dialog, drag to canvas, client handler, image

**Files:**
- Create: `src/modules/editor/stencils/categories.ts` (move `CATEGORY_LABEL` and `CATEGORY_ORDER` out of `StencilGrid.tsx`, re-export from there if anything else imports them)
- Create: `src/modules/editor/state/libraryStore.ts`
- Create: `src/modules/editor/interactions/canvas-drop.ts` (pure drop maths and dispatch plan)
- Create: `src/components/editor/shell/stencils/visio-upload.ts` (the fetch, free of React)
- Create: `src/components/editor/shell/stencils/LibraryGroup.tsx`
- Create: `src/components/editor/shell/stencils/LibraryStencilCard.tsx`
- Create: `src/components/editor/shell/stencils/VisioImportDialog.tsx`
- Create: `src/components/editor/three/CanvasDropTarget.tsx`
- Modify: `src/components/editor/shell/stencils/StencilGrid.tsx` (file drop zone, My library group on top)
- Modify: `src/components/editor/shell/stencils/StencilCard.tsx` (`draggable`, `onDragStart`)
- Modify: `src/components/editor/three/SceneCanvas.tsx` (mount `<CanvasDropTarget />`)
- Modify: `src/components/editor/ClientCommandHandlers.tsx` (handler for `stencil.library.place`)
- Modify: `Dockerfile` (runtime stage `apk add --no-cache openssl libc6-compat libvisio-tools`)
- Modify: `docs/feature-matrix.md` (one row, follow its format) saying custom stencils import from Visio `.vss`/`.vssx` by drag and drop
- Test: `src/test/unit/editor/library-store.test.ts`, `src/test/unit/editor/canvas-drop.test.ts`, `src/test/unit/editor/LibraryGroup.test.tsx`, `src/test/unit/editor/VisioImportDialog.test.tsx`, `src/test/unit/editor/StencilCard-drag.test.tsx`

**Interfaces:**
- Consumes: `types.ts` (`LibraryCommand`, `OrgStencilSummary`, `PreviewOutput`, `CommitInput`, `PlacementSchema`, `PlaceInput`, `PlaceOutput`, `VISIO_*`, `VisioMessage`, `VISIO_SCALE_OPTIONS`, `SKIP_REASON_LABEL`, `PLACEABLE_SHAPE_KINDS`), `stencil-drag.ts`, `dispatch` from `src/lib/commands/dispatch.ts`, `groundPoint` from `src/lib/three/ground.ts`, `inches` from `src/lib/three/units.ts`, `useFileDrop` from `src/components/imports/ImportEmptyState.tsx`, `getStencil`/`STENCILS` from `src/modules/editor/stencils`, `stagingPlacement`/`stagedCount` from `src/modules/editor/placement.ts`, `useShapesStore`, UI primitives in `src/components/ui/` (`dialog`, `checkbox`, `select`, `button`, `input`), `toast` from `sonner`.
- Produces:

```ts
// libraryStore.ts
export interface LibraryState {
  stencils: OrgStencilSummary[]
  loaded: boolean
  loading: boolean
  error: string | null
  /** Dispatches stencil.library.list and replaces `stencils`. */
  refresh: () => Promise<void>
  /** Replace by id or add, after a commit. */
  upsertMany: (stencils: OrgStencilSummary[]) => void
  remove: (id: string) => void
}
export const useLibraryStore: UseBoundStore<StoreApi<LibraryState>>
export function libraryStencilsByCategory(stencils: OrgStencilSummary[]): Map<StencilCategory, OrgStencilSummary[]>

// canvas-drop.ts
export interface DropPlan { command: 'add.shape' | 'stencil.library.place'; input: { stencilId?: string; orgStencilId?: string; x: number; y: number } }
/** Null when the payload is not a stencil drag. Ground is in world feet (x, z); the plan is in inches. */
export function planDrop(payload: StencilDragPayload | null, groundFt: { x: number; z: number } | null): DropPlan | 'no-ground' | null

// visio-upload.ts
export async function uploadStencilFile(file: File): Promise<{ ok: true; data: PreviewOutput } | { ok: false; error: string }>

// LibraryGroup.tsx
export function LibraryGroup(props: { search: string; onImportFile: (file: File) => void }): JSX.Element
// VisioImportDialog.tsx
export function VisioImportDialog(props: { preview: PreviewOutput; onClose: () => void; onImported: (stencils: OrgStencilSummary[]) => void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

`library-store.test.ts`:
```ts
import { ShapeKind, StencilCategory } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn() }))
import { dispatch } from '@/lib/commands/dispatch'
import { libraryStencilsByCategory, useLibraryStore } from '@/modules/editor/state/libraryStore'
import type { OrgStencilSummary } from '@/modules/imports/visio/types'

const s = (name: string, category: StencilCategory): OrgStencilSummary => ({
  id: name, name, category, shapeKind: ShapeKind.SKETCH_PATH, widthIn: 12, heightIn: 12, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#000000', stroke: '#000000', sourceFile: 'Pool.vss', updatedAt: '2026-10-16T00:00:00.000Z',
})

describe('library store', () => {
  beforeEach(() => useLibraryStore.setState({ stencils: [], loaded: false, loading: false, error: null }))

  it('refresh dispatches the list command and stores the result', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: true, data: { stencils: [s('A', StencilCategory.POOL_SHAPE)] } })
    await useLibraryStore.getState().refresh()
    expect(dispatch).toHaveBeenCalledWith('stencil.library.list', {})
    expect(useLibraryStore.getState().stencils.map(x => x.name)).toEqual(['A'])
    expect(useLibraryStore.getState().loaded).toBe(true)
  })

  it('keeps the old list and records the error when the list fails', async () => {
    useLibraryStore.setState({ stencils: [s('Old', StencilCategory.POOL_SHAPE)] })
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: false, error: 'nope' })
    await useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().stencils).toHaveLength(1)
    expect(useLibraryStore.getState().error).toBe('nope')
  })

  it('upsertMany replaces by id and remove drops', () => {
    useLibraryStore.setState({ stencils: [s('A', StencilCategory.POOL_SHAPE)] })
    useLibraryStore.getState().upsertMany([{ ...s('A', StencilCategory.POOL_SHAPE), widthIn: 99 }, s('B', StencilCategory.DECK_HOUSE)])
    expect(useLibraryStore.getState().stencils.map(x => [x.name, x.widthIn])).toEqual([['A', 99], ['B', 12]])
    useLibraryStore.getState().remove('A')
    expect(useLibraryStore.getState().stencils.map(x => x.name)).toEqual(['B'])
  })

  it('groups by category in panel order', () => {
    const groups = libraryStencilsByCategory([s('d', StencilCategory.DECK_HOUSE), s('p', StencilCategory.POOL_SHAPE)])
    expect([...groups.keys()]).toEqual([StencilCategory.POOL_SHAPE, StencilCategory.DECK_HOUSE])
  })
})
```

`canvas-drop.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { planDrop } from '@/modules/editor/interactions/canvas-drop'

describe('planDrop', () => {
  it('centres a catalogue stencil under the pointer in inches', () => {
    // 10 ft, 20 ft on the ground is 120, 240 inches; a 360 by 168 pool is offset by half.
    expect(planDrop({ source: 'catalog', id: 'pool.rectangle', widthIn: 360, heightIn: 168 }, { x: 10, z: 20 }))
      .toEqual({ command: 'add.shape', input: { stencilId: 'pool.rectangle', x: -60, y: 156 } })
  })
  it('routes a library stencil to its own command', () => {
    expect(planDrop({ source: 'library', id: 'clx1', widthIn: 300, heightIn: 144 }, { x: 25, z: 12 }))
      .toEqual({ command: 'stencil.library.place', input: { orgStencilId: 'clx1', x: 150, y: 72 } })
  })
  it('says no-ground in side elevation and null for a non-stencil drag', () => {
    expect(planDrop({ source: 'catalog', id: 'pool.rectangle', widthIn: 1, heightIn: 1 }, null)).toBe('no-ground')
    expect(planDrop(null, { x: 0, z: 0 })).toBeNull()
  })
})
```

`StencilCard-drag.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StencilCard } from '@/components/editor/shell/stencils/StencilCard'
import { STENCIL_DRAG_MIME } from '@/modules/editor/interactions/stencil-drag'
import { getStencil } from '@/modules/editor/stencils'

describe('StencilCard drag', () => {
  it('is draggable and writes the stencil payload at real size', () => {
    const stencil = getStencil('pool.rectangle')!
    render(<StencilCard stencil={stencil} onAdd={vi.fn()} />)
    const card = screen.getByRole('button', { name: /standard rectangle/i })
    expect(card).toHaveAttribute('draggable', 'true')
    const data = new Map<string, string>()
    fireEvent.dragStart(card, { dataTransfer: { setData: (k: string, v: string) => data.set(k, v), types: [], effectAllowed: 'none' } })
    expect(JSON.parse(data.get(STENCIL_DRAG_MIME)!)).toEqual({ source: 'catalog', id: 'pool.rectangle', widthIn: 360, heightIn: 168 })
  })
})
```

`LibraryGroup.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { ShapeKind, StencilCategory } from '@prisma/client'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn(async () => ({ ok: true, data: { stencils: [] } })) }))
import { LibraryGroup } from '@/components/editor/shell/stencils/LibraryGroup'
import { useLibraryStore } from '@/modules/editor/state/libraryStore'
import { STENCIL_DRAG_MIME } from '@/modules/editor/interactions/stencil-drag'

const kidney = {
  id: 'clx1', name: 'Kidney 11', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL, widthIn: 324, heightIn: 171,
  thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', fill: '#00ffff', stroke: '#000000', sourceFile: 'Pool.vss', updatedAt: '2026-10-16T00:00:00.000Z',
}
const alarm = { ...kidney, id: 'clx2', name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, widthIn: 12, heightIn: 12 }

describe('LibraryGroup', () => {
  beforeEach(() => useLibraryStore.setState({ stencils: [], loaded: true, loading: false, error: null }))

  it('shows the drop zone when the library is empty', () => {
    render(<LibraryGroup search="" onImportFile={vi.fn()} />)
    expect(screen.getByText(/drop a visio stencil/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument()
  })

  it('lists stencils with thumbnails and drags them as library stencils', () => {
    useLibraryStore.setState({ stencils: [kidney] })
    render(<LibraryGroup search="" onImportFile={vi.fn()} />)
    expect(screen.getByText('My library')).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /kidney 11/i })
    expect(card.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    const data = new Map<string, string>()
    fireEvent.dragStart(card, { dataTransfer: { setData: (k: string, v: string) => data.set(k, v), types: [], effectAllowed: 'none' } })
    expect(JSON.parse(data.get(STENCIL_DRAG_MIME)!)).toMatchObject({ source: 'library', id: 'clx1', widthIn: 324, heightIn: 171 })
  })

  it('filters by the search box like the catalogue does', () => {
    useLibraryStore.setState({ stencils: [kidney, alarm] })
    render(<LibraryGroup search="alarm" onImportFile={vi.fn()} />)
    expect(screen.queryByText('Kidney 11')).toBeNull()
    expect(screen.getByText('Guard Alarm')).toBeInTheDocument()
  })
})
```

`VisioImportDialog.test.tsx`:
```tsx
/** @vitest-environment jsdom */
import { ShapeKind, StencilCategory } from '@prisma/client'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn() }))
import { dispatch } from '@/lib/commands/dispatch'
import { VisioImportDialog } from '@/components/editor/shell/stencils/VisioImportDialog'
import type { PreviewOutput } from '@/modules/imports/visio/types'

const preview: PreviewOutput = {
  importId: 'imp1', fileName: 'Pool.vss', scaleInchesPerInch: 96,
  candidates: [
    { index: 0, name: 'Standard Rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL, drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000' },
    { index: 1, name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, drawingWidthIn: 0.125, drawingHeightIn: 0.125, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#ffffff', stroke: '#000000' },
  ],
  skipped: [{ index: 2, name: 'SOB Text', reason: 'TEXT_ONLY' }],
}

describe('VisioImportDialog', () => {
  it('shows real-world sizes at the chosen scale and the skipped list with reasons', () => {
    render(<VisioImportDialog preview={preview} onClose={vi.fn()} onImported={vi.fn()} />)
    expect(screen.getByText("25' × 12'")).toBeInTheDocument()
    expect(screen.getByText('SOB Text')).toBeInTheDocument()
    expect(screen.getByText(/text only/i)).toBeInTheDocument()
  })

  it('commits only the ticked rows with the edited name and reports the count', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: true, data: { created: 1, replaced: 0, stencils: [] } })
    const onImported = vi.fn()
    render(<VisioImportDialog preview={preview} onClose={vi.fn()} onImported={onImported} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /guard alarm/i }))
    fireEvent.change(screen.getByDisplayValue('Standard Rectangle'), { target: { value: 'Our rectangle' } })
    fireEvent.click(screen.getByRole('button', { name: /import 1 stencil$/i }))
    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(vi.mocked(dispatch).mock.calls[0]?.[0]).toBe('stencil.library.commit')
    expect(vi.mocked(dispatch).mock.calls[0]?.[1]).toEqual({
      importId: 'imp1', scaleInchesPerInch: 96,
      items: [
        { index: 0, include: true, name: 'Our rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL },
        { index: 1, include: false, name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH },
      ],
    })
    await waitFor(() => expect(onImported).toHaveBeenCalled())
  })

  it('shows the command error inline and keeps the dialog open', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: false, error: 'That preview expired. Drop the file again.' })
    const onClose = vi.fn()
    render(<VisioImportDialog preview={preview} onClose={onClose} onImported={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /import 2 stencils/i }))
    await waitFor(() => expect(screen.getByText(/preview expired/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

Also add to `LibraryGroup.test.tsx` or a small `StencilGrid` test: a `dragover` on the panel wrapper carrying only `STENCIL_DRAG_MIME` (no `Files`) does not turn on the dragging wash (Review Focus 5).

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement.**
  - `categories.ts`: export `CATEGORY_LABEL` and `CATEGORY_ORDER` (moved verbatim from `StencilGrid.tsx`).
  - `libraryStore.ts`: zustand `create`; `refresh` is a no-op while `loading`; `libraryStencilsByCategory` groups in `CATEGORY_ORDER`.
  - `canvas-drop.ts`: `planDrop` uses `inches()` on `ground.x` and `ground.z`, then `dropTopLeft`, then `DROP_COMMAND[payload.source]`. Build the input object without undefined keys (`exactOptionalPropertyTypes`).
  - `CanvasDropTarget.tsx`: inside `<Canvas>`, `useThree()` for `gl` and `camera`; one `THREE.Raycaster`. `useEffect` adds native `dragover` and `drop` listeners on `gl.domElement`. `dragover`: if `hasStencilDrag(e.dataTransfer?.types)` then `e.preventDefault()` and `dropEffect = 'copy'`. `drop`: `decodeStencilDrag`; null returns without `preventDefault` (a file dropped on the canvas is not ours; `useFileDrop`'s document-level swallow already stops navigation); otherwise `e.preventDefault()`, `groundPoint(e, gl.domElement, camera, raycaster)`, `planDrop`; `'no-ground'` toasts `VisioMessage.NO_GROUND`; else `void dispatch(plan.command, plan.input)` and `toast.error` on `ok: false`. Renders null. Mount it in `SceneCanvas.tsx` after `<SketchGestures />`.
  - `StencilCard.tsx`: `draggable`, `onDragStart={(e) => encodeStencilDrag(e.dataTransfer, { source: StencilDragSource.CATALOG, id: stencil.id, widthIn, heightIn })}` with inches from `defaultDimensions` (ft times 12). Keep the click.
  - `LibraryStencilCard.tsx`: same layout as `StencilCard` (46 px preview box), preview is `<img alt="" src={svgDataUrl(thumbnailSvg)} />` where `svgDataUrl = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)`. Dimension label in feet like `StencilCard`. A remove control (`aria-label="Remove {name} from library"`) dispatching `stencil.library.delete` then `useLibraryStore.getState().remove(id)`. Click (not drag) stages like the catalogue: `stagingPlacement(shapes, id, stagedCount(shapes))` then `dispatch(LibraryCommand.PLACE, { orgStencilId: id, x, y })`.
  - `LibraryGroup.tsx`: on mount `refresh()` if `!loaded`. Header "My library" with count and an "Import" button opening a hidden `<input type="file" accept={VISIO_FILE_ACCEPT}>` that calls `onImportFile`. Empty and unfiltered: a dashed zone with `Drop a Visio stencil (.vss or .vssx) here, or` and a `Choose file` button. Non-empty: cards grouped by category with `CATEGORY_LABEL`. Filtered by `search` on name and category like `StencilGrid`.
  - `StencilGrid.tsx`: wrap the whole list in a `div` carrying `useFileDrop(files => onFiles(files))` props and a `dragging` wash (reuse the classes `ImportEmptyState` uses for its zone). `onFiles` takes the first file, `uploadStencilFile`, on ok sets `preview` state rendering `<VisioImportDialog preview onClose onImported />`; on error `toast.error(error)`. `onImported(stencils)` calls `upsertMany(stencils)` and closes. Render `<LibraryGroup search={search} onImportFile={...} />` above the catalogue sections.
  - `visio-upload.ts`: `FormData` with `VISIO_UPLOAD_FIELD` and `fileName`, `fetch(VISIO_UPLOAD_URL, { method: 'POST', body })`, JSON out; network failure returns `{ ok: false, error: 'The upload could not reach the server. Check your connection and try again.' }`; non-JSON returns `HTTP ${status}`.
  - `VisioImportDialog.tsx`: `Dialog` open; header with file name and a scale `Select` over `VISIO_SCALE_OPTIONS` (default the preview's scale); rows: `Checkbox` (aria-label the name), thumbnail img, name `Input`, category `Select`, kind `Select` over `PLACEABLE_SHAPE_KINDS` with labels (`Freeform pool`, `Outline`, `Spa`, `Sun shelf`, `Bench`, `Concrete deck`, `Paver deck`, `Grass`), size at the current scale (`${ft(w)}' × ${ft(h)}'`, one decimal when not whole). A collapsed "Skipped (N)" list with `SKIP_REASON_LABEL`. Footer: Cancel, `Import N stencil(s)` disabled at N = 0. Submit dispatches `LibraryCommand.COMMIT` with every row (included or not) so the audit row records the decision; on ok `toast.success(...)`, `onImported(data.stencils)`; on error show it under the footer.
  - `ClientCommandHandlers.tsx`, next to the `add.shape` handler:
    ```ts
    registerClientHandler<PlaceInput, PlaceOutput>('stencil.library.place', (input, serverData) => {
      const placement = PlacementSchema.parse(serverData)
      const store = useShapesStore.getState()
      const opts: { name: string; width: number; height: number; points?: { x: number; y: number }[]; closed?: boolean; labelText?: string } = {
        name: placement.name, width: placement.width, height: placement.height,
      }
      if (placement.shapeKind === ShapeKind.POLYGON_POOL) opts.points = placement.points
      if (placement.shapeKind === ShapeKind.SKETCH_PATH) { opts.points = placement.points; opts.closed = true; opts.labelText = placement.name }
      const shapeId = store.addShape(placement.shapeKind, input.x, input.y, opts)
      return { ...placement, shapeId }
    })
    ```
    The literal `'stencil.library.place'` is required by the wiring test's regex. `AddShapeOptions` in `shapesStore.ts` already accepts `points`, `closed`, `labelText`, `name`, `width`, `height`.
  - `Dockerfile`: runtime stage `RUN apk add --no-cache openssl libc6-compat libvisio-tools` with a comment that `vss2raw` is what `src/modules/imports/visio/convert.ts` spawns. Do not touch the deps or build stages.
  - `docs/feature-matrix.md`: one row in its format.

- [ ] **Step 4: Run the five new tests, `src/test/unit/imports/file-drop.test.tsx`, `src/test/unit/brand/palette.test.ts` and `src/test/unit/commands/wiring.test.ts`. The wiring test passes only once Task 3's command is in the same tree; until then it reports an orphan handler, which is expected and reported. `pnpm typecheck && pnpm lint`.**

---

## Task 5: integration (controller)

- [ ] Merge the three branches into `main` in the order 1, 2+3, 4; resolve conflicts (plausible only in `init.ts`, `SceneCanvas.tsx`, `.env.example`), grep for `<<<<<<<`, `pnpm install --frozen-lockfile`, `pnpm prisma generate`.
- [ ] Swap the inline scaling in `stencil-library.ts` for `scaleRings` from `scale.ts`.
- [ ] With `DATABASE_URL` on 5434: `pnpm test && pnpm typecheck && pnpm lint` all green, including `wiring.test.ts` and `visio-route.test.ts`.
- [ ] Real files: a one-off script through `convertStencilFile(readFileSync(f), basename(f))` for the three files in `/Users/b/Downloads`; expect 44 candidates for Pool.vss; record all three counts in the commit message.
- [ ] Playwright `src/test/e2e/visio-import.spec.ts`: skip unless `VISIO_STENCIL_DIR` is set; sign in as demo, open the editor, Stencils tab, `setInputFiles` on the hidden input with `Pool.vss`, wait for the dialog, Import, expect "My library" with a `Standard Rectangle` card; then drive a drop: `page.evaluate` builds a `DataTransfer`, sets `application/x-poolforge-stencil`, dispatches `dragover` then `drop` on `canvas` at its centre; the Layers tab lists `Standard Rectangle`. If `DataTransfer` cannot be constructed, click the card instead and say which path ran.
- [ ] Commit: `feat(stencils): import Visio stencil files by drag and drop into an org library, drag any stencil onto the canvas`. Push.
- [ ] Deploy with `./deploy.sh`, then smoke: `curl -s -o /dev/null -w '%{http_code}' -X POST $URL/api/imports/visio` expects 401; sign in and drop `Pool.vss`, see 44 candidates.
- [ ] Update `~/claude-config/memory/projects/pool-forge/` with where the library lives and the 5434 note if absent.
