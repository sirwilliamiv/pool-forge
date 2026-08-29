# Wave 1 / Track 2 — Pool Footprints Are Real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Roadmap amendment (2026-08-19, Wave I0).** The freeform polygon primitive this track was slated to create now ships from `2026-08-19-image-ingestion-design.md` Wave I0, because full auto geometry needs it first. **T2 is a consumer, not the author, of:**
>
> - `ShapeKind.POLYGON_POOL` (prisma enum, migration `20260819151011_image_ingestion_contract`),
> - the `PolygonPool` variant and `isPolygonPool()` guard in `src/modules/editor/state/shapes.ts`,
> - `src/lib/geometry/polygon-footprint.ts` (`polygonArea`, `polygonPerimeter`, `polygonBounds`, `polygonCentroid`, `normalizePolygon`, `isSelfIntersecting`),
> - `src/components/editor/three/objects/PolygonPool.tsx` and its `SceneRoot` dispatch case,
> - the POLYGON_POOL branch in `src/modules/measurements/engine.ts`, which measures the silhouette rather than the bounding box.
>
> T2 still owns the silhouette **library** (`silhouettes.ts`, `FOOTPRINT_LIBRARY`, stencil wiring, plan SVG). Build the normalised 0..1 silhouettes on top of the primitive above rather than a second polygon path: rebase onto I0 before starting.

**Goal:** Every pool shape in the stencil catalog has its own silhouette — measured, rendered in 3D, and drawn in the plan SVG from one definition.

**Architecture:** Wave 0 put a `Footprint` union behind `resolveFootprint()` and routed all pool metrics through `poolFootprintMetrics()`. This track fills `FOOTPRINT_LIBRARY` with normalised silhouettes, adds one extruded-polygon renderer that consumes them, and points the plan SVG at the same source. One silhouette definition, three consumers — a pool cannot measure as one shape and draw as another.

**Tech Stack:** three.js `Shape`/`ExtrudeGeometry`, SVG, Vitest.

## Global Constraints

See `2026-07-24-world-class-roadmap.md` → Global Constraints. **Depends on Wave 0.** Footprint points are normalised 0..1 within the bounding box and wound counter-clockwise; the y axis runs "down" in drawing space, matching `Shape.y`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/geometry/footprint.ts` (modify) | `FOOTPRINT_LIBRARY` gains real silhouettes; add `footprintForStencil(stencilId)`. |
| `src/lib/geometry/silhouettes.ts` (create) | The point data itself — one exported constant per pool shape, with a comment naming the real-world shape. Kept separate so the resolver file stays small. |
| `src/components/editor/three/objects/FootprintPool.tsx` (create) | Extruded-polygon pool basin + water surface, driven by `resolveFootprint`. |
| `src/components/editor/three/renderers.tsx` (modify) | Register `FootprintPool` for every `POOL_SHAPE` stencil id that has a silhouette. |
| `src/modules/editor/stencils/index.ts` (modify) | Pool-shape stencils carry `displayHint` defaults so dropping one sets `poolShape: 'polygon'` + `footprintId`. |
| `src/components/editor/ClientCommandHandlers.tsx` (modify) | `add.shape` copies the stencil's default `displayHint` onto the new shape. |
| `src/modules/exports/svg.ts` + `src/components/exports/DrawingSvg.tsx` (modify) | Plan view draws the same silhouette as a `<polygon>`. |

---

### Task 1: The silhouette library

**Files:**
- Create: `src/lib/geometry/silhouettes.ts`
- Modify: `src/lib/geometry/footprint.ts`
- Test: `src/test/unit/silhouettes.test.ts`

**Interfaces:**
- Produces:
  - `GRECIAN`, `ROMAN`, `KIDNEY`, `LAP`, `L_SHAPE`, `FREEFORM`, `ROUND_CORNERS`: `readonly Point[]` — each normalised 0..1.
  - `POOL_SILHOUETTES: Readonly<Record<string, readonly Point[]>>` keyed by `StencilDef.id`.
  - `footprintForStencil(stencilId: string): readonly Point[] | undefined`

Start with these seven — they cover the catalog's pool-shape category minus the two already handled (`pool.rectangle`, ellipse-flagged ovals). Add the rest by the same pattern once the first renders.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/silhouettes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { POOL_SILHOUETTES } from '@/lib/geometry/silhouettes'
import { polygonAreaSqft, polygonBoundingBox } from '@/lib/geometry/polygon'
import { footprintPointsInInches } from '@/lib/geometry/footprint'

describe('pool silhouettes', () => {
  const entries = Object.entries(POOL_SILHOUETTES)

  it('defines at least seven silhouettes', () => {
    expect(entries.length).toBeGreaterThanOrEqual(7)
  })

  it.each(entries)('%s is normalised to the unit box', (_id, points) => {
    const bbox = polygonBoundingBox(points)
    expect(bbox.x).toBeCloseTo(0, 5)
    expect(bbox.y).toBeCloseTo(0, 5)
    expect(bbox.width).toBeCloseTo(1, 5)
    expect(bbox.height).toBeCloseTo(1, 5)
  })

  it.each(entries)('%s covers between 55%% and 100%% of its bounding box', (_id, points) => {
    const scaled = footprintPointsInInches(points, 25 * 12, 12 * 12)
    const area = polygonAreaSqft(scaled)
    const boxArea = (25 * 12 * (12 * 12)) / 144
    const ratio = area / boxArea
    expect(ratio).toBeGreaterThan(0.55)
    expect(ratio).toBeLessThanOrEqual(1)
  })

  it.each(entries)('%s has no duplicate consecutive points', (_id, points) => {
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!
      const b = points[(i + 1) % points.length]!
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(1e-6)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/silhouettes.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/geometry/silhouettes"`.

- [ ] **Step 3: Write the silhouettes**

Create `src/lib/geometry/silhouettes.ts`. Points are `[x, y]` normalised 0..1, listed clockwise from the top-left in drawing space. Example for the two structurally interesting cases — write the remaining five in the same style:

```ts
// Normalised pool silhouettes, 0..1 inside the shape's bounding box.
// Every list starts at the top-left corner and runs clockwise.

import type { Point } from './polygon'

/** Grecian: rectangle with the four corners cut at 45°. */
export const GRECIAN: readonly Point[] = [
  [0.18, 0], [0.82, 0], [1, 0.18], [1, 0.82],
  [0.82, 1], [0.18, 1], [0, 0.82], [0, 0.18],
]

/** Roman: straight sides with semicircular ends, sampled at 16 points per end. */
export const ROMAN: readonly Point[] = (() => {
  const pts: Point[] = []
  const SEGMENTS = 16
  // Right end: semicircle from top-right to bottom-right.
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI
    pts.push([0.8 + 0.2 * Math.sin(t), 0.5 - 0.5 * Math.cos(t)])
  }
  // Left end: semicircle from bottom-left to top-left.
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI
    pts.push([0.2 - 0.2 * Math.sin(t), 0.5 + 0.5 * Math.cos(t)])
  }
  return pts
})()

export const POOL_SILHOUETTES: Readonly<Record<string, readonly Point[]>> = {
  'pool.grecian': GRECIAN,
  'pool.roman': ROMAN,
  // ...one entry per pool-shape stencil id
}

export function footprintForStencil(stencilId: string): readonly Point[] | undefined {
  return POOL_SILHOUETTES[stencilId]
}
```

Then in `src/lib/geometry/footprint.ts`, replace the empty placeholder:

```ts
import { POOL_SILHOUETTES } from './silhouettes'

export const FOOTPRINT_LIBRARY: Readonly<Record<string, readonly Point[]>> = POOL_SILHOUETTES
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/silhouettes.test.ts`
Expected: PASS. If the "covers 55%" assertion fails for a shape, the silhouette is wrong — a pool that fills less than half its bounding box will look like a mistake in the drawing.

- [ ] **Step 5: Prove the measurements now differ by shape**

Append to `src/test/unit/silhouettes.test.ts`:

```ts
import { poolFootprintMetrics } from '@/modules/measurements/footprint'

describe('footprint-driven measurement', () => {
  const box = { width: 25 * 12, height: 12 * 12 }

  it('a grecian pool measures less than its bounding rectangle', () => {
    const rect = poolFootprintMetrics(box).areaSqft
    const grecian = poolFootprintMetrics({
      ...box,
      displayHint: { poolShape: 'polygon', footprintId: 'pool.grecian' },
    }).areaSqft
    expect(grecian).toBeLessThan(rect)
    expect(grecian).toBeGreaterThan(rect * 0.8)
  })
})
```

Run: `pnpm vitest run src/test/unit/silhouettes.test.ts`
Expected: PASS — this is the assertion that proves the whole chain works end to end.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geometry/silhouettes.ts src/lib/geometry/footprint.ts src/test/unit/silhouettes.test.ts
git commit -m "feat(geometry): real pool silhouettes wired into footprint measurement"
```

---

### Task 2: Extruded footprint renderer

**Files:**
- Create: `src/components/editor/three/objects/FootprintPool.tsx`
- Modify: `src/components/editor/three/renderers.tsx`
- Test: manual (three.js geometry construction is not meaningfully unit-testable here; the silhouette maths is already covered by Task 1)

**Interfaces:**
- Consumes: `resolveFootprint`, `footprintPointsInInches`, `feet()`, `useSlotMaterial` if T1 has landed (otherwise `getMaterial('pebbletecBlueGranite')`).
- Produces: `FootprintPool({ shape }: { shape: Shape })`.

- [ ] **Step 1: Write the renderer**

Create `src/components/editor/three/objects/FootprintPool.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { footprintPointsInInches, resolveFootprint } from '@/lib/geometry/footprint'
import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { getMaterial, waterDefault } from '../Materials'

const WALL_HEIGHT = 5

interface Props {
  shape: Shape
}

// Pool basin for any shape whose footprint resolves to a polygon: the
// silhouette is extruded downward, and the water surface is the same
// silhouette as a flat mesh just below the coping line.
export function FootprintPool({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const footprint = resolveFootprint(shape)

  const geometry = useMemo(() => {
    if (footprint.kind !== 'polygon') return null
    const pts = footprintPointsInInches(footprint.points, shape.width, shape.height)
    const path = new THREE.Shape()
    const first = pts[0]
    if (!first) return null
    // Drawing space is x/y; the scene is x/z, so y maps to z and the shape is
    // built in the XY plane then rotated flat.
    path.moveTo(feet(first[0]), feet(first[1]))
    for (const [x, y] of pts.slice(1)) path.lineTo(feet(x), feet(y))
    path.closePath()
    return new THREE.ExtrudeGeometry(path, { depth: WALL_HEIGHT, bevelEnabled: false })
  }, [footprint, shape.width, shape.height])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null

  return (
    <group
      ref={ref}
      position={[feet(shape.x), 0, feet(shape.y)]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh
        geometry={geometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        material={getMaterial('pebbletecBlueGranite')}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={geometry}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -0.32, 0]}
        scale={[0.98, 0.98, 0.02]}
        material={waterDefault}
        receiveShadow
      />
    </group>
  )
}

export default FootprintPool
```

If Track 1 has already merged, swap `getMaterial('pebbletecBlueGranite')` for `useSlotMaterial(shape, 'interior', pebbletecBlueGranite)`.

- [ ] **Step 2: Register it for every silhouette**

In `src/components/editor/three/renderers.tsx`:

```tsx
import { POOL_SILHOUETTES } from '@/lib/geometry/silhouettes'
import { FootprintPool } from './objects/FootprintPool'

for (const stencilId of Object.keys(POOL_SILHOUETTES)) {
  registerStencilRenderer(stencilId, ({ shape }) => <FootprintPool shape={shape} />)
}
```

`FootprintPool` positions itself, so it is registered raw rather than through `positioned()`.

- [ ] **Step 3: Make dropping a stencil set the hint**

Pool-shape stencils must produce shapes carrying `displayHint.poolShape = 'polygon'` and `footprintId`. In `src/modules/editor/stencils/index.ts`, add to each pool-shape entry that has a silhouette:

```ts
    defaultDisplayHint: { poolShape: 'polygon', footprintId: 'pool.grecian' },
```

(with its own id), extend the `Stencil` type in `stencils/types.ts` with `defaultDisplayHint?: DisplayHint`, and in `ClientCommandHandlers.tsx`'s `add.shape` handler merge it:

```tsx
      const hint = { ...(stencil?.defaultDisplayHint ?? {}), ...(input.displayHint ?? {}) }
      if (Object.keys(hint).length > 0) store.updateShape(shapeId, { displayHint: hint })
```

- [ ] **Step 4: Verify in the running app**

```bash
pnpm db:up && PORT=3007 pnpm dev
```

Drop a Grecian, a Roman, and a kidney pool. Expected: three visibly different silhouettes, each with water, each selectable, and the measurement panel shows a different surface area for each despite equal bounding boxes.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/three/objects/FootprintPool.tsx src/components/editor/three/renderers.tsx src/modules/editor/stencils src/components/editor/ClientCommandHandlers.tsx
git commit -m "feat(editor): extruded footprint pools for every silhouette"
```

---

### Task 3: The plan view draws the same silhouette

**Files:**
- Modify: `src/modules/exports/svg.ts`, `src/components/exports/DrawingSvg.tsx`
- Test: `src/test/unit/exports-svg.test.ts`

**Interfaces:**
- Consumes: `resolveFootprint`, `footprintPointsInInches`.
- Produces: `shapeToSvgPath(shape): { kind: 'rect' | 'ellipse' | 'polygon'; points?: string }` — `points` is the `<polygon points="...">` attribute value in SVG user units.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/exports-svg.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ShapeKind } from '@prisma/client'
import { shapeToSvgPath } from '@/modules/exports/svg'
import type { Shape } from '@/modules/editor/state/shapes'

function pool(displayHint?: Shape['displayHint']): Shape {
  return {
    id: 'p1', kind: ShapeKind.RECTANGLE_POOL, x: 0, y: 0,
    width: 300, height: 144, rotation: 0, zIndex: 1,
    locked: false, hidden: false, depthShallow: 3, depthDeep: 5,
    ...(displayHint ? { displayHint } : {}),
  }
}

describe('shapeToSvgPath', () => {
  it('emits a rect for a plain pool', () => {
    expect(shapeToSvgPath(pool()).kind).toBe('rect')
  })

  it('emits an ellipse for an oval pool', () => {
    expect(shapeToSvgPath(pool({ poolShape: 'ellipse' })).kind).toBe('ellipse')
  })

  it('emits a polygon whose point count matches the silhouette', () => {
    const path = shapeToSvgPath(pool({ poolShape: 'polygon', footprintId: 'pool.grecian' }))
    expect(path.kind).toBe('polygon')
    expect(path.points?.split(' ')).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/exports-svg.test.ts`
Expected: FAIL — `shapeToSvgPath is not exported`.

- [ ] **Step 3: Implement and consume it**

Add to `src/modules/exports/svg.ts`:

```ts
import { footprintPointsInInches, resolveFootprint } from '@/lib/geometry/footprint'
import type { Shape } from '@/modules/editor/state/shapes'

export interface SvgPath {
  kind: 'rect' | 'ellipse' | 'polygon'
  /** `<polygon points="...">` attribute value, in the same user units as x/y. */
  points?: string
}

export function shapeToSvgPath(shape: Shape): SvgPath {
  const footprint = resolveFootprint(shape)
  if (footprint.kind === 'ellipse') return { kind: 'ellipse' }
  if (footprint.kind === 'polygon') {
    const points = footprintPointsInInches(footprint.points, shape.width, shape.height)
      .map(([x, y]) => `${shape.x + x},${shape.y + y}`)
      .join(' ')
    return { kind: 'polygon', points }
  }
  return { kind: 'rect' }
}
```

Then in `DrawingSvg.tsx`, where a pool currently always renders a `<rect>`, branch on `shapeToSvgPath(shape).kind` and emit `<rect>`, `<ellipse>`, or `<polygon points={path.points} />` — reusing the existing fill/stroke/transform attributes unchanged so the visual language of the plan view does not shift.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/exports-svg.test.ts && pnpm test`
Expected: both PASS.

- [ ] **Step 5: Verify in the documents**

With the dev server running, open `/projects/seed-project-demo/construction` and `/proposal` after placing a Grecian pool. Expected: the plan view shows the cut-corner silhouette, not a rectangle.

- [ ] **Step 6: Commit**

```bash
git add src/modules/exports/svg.ts src/components/exports/DrawingSvg.tsx src/test/unit/exports-svg.test.ts
git commit -m "feat(exports): plan view draws the real pool silhouette"
```

---

## Track exit criteria

- [ ] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` clean.
- [ ] Every stencil in `StencilCategory.POOL_SHAPE` either has a silhouette or is deliberately rectangle/ellipse — no pool shape falls through to `GenericStencil`.
- [ ] The same Grecian pool shows the same silhouette in the 3D scene, the plan overlay, the proposal, and the construction packet.
- [ ] Measured area for a Grecian differs from a rectangle of identical bounding box.
