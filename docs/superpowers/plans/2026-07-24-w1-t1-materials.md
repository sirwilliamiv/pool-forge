# Wave 1 / Track 1 — Materials Are Real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choosing a material changes what is rendered, what is saved, what is printed, and what is charged.

**Architecture:** The `Material` table is already seeded and already read by the editor page. The break is at the last three feet: the command handlers echo instead of writing, the inspector shows hardcoded options, and the three.js objects ignore `materialId`. This track wires shape → slot → `Material.fillSpec` → three.js material, and slot → price-book item → quote line.

**Tech Stack:** Zustand, three.js, Prisma, Zod, Vitest.

## Global Constraints

See `2026-07-24-world-class-roadmap.md` → Global Constraints. **Depends on Wave 0** — `ShapeBase.materialSlots`, `MaterialSlot`, and the renderer registry must exist before starting.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/modules/materials/index.ts` (create) | `MaterialSpec` type, `parseFillSpec()`, `materialForSlot()`. Pure — no three.js, no React, so both the server (documents, pricing) and the client (scene) can use it. |
| `src/components/editor/three/Materials.ts` (modify) | `materialFromSpec(spec)` builds/caches a `THREE.Material` from a `MaterialSpec`; keep the existing named singletons as fallbacks. |
| `src/components/editor/three/objects/{PoolWalls,Water,Coping,TileBand,Deck,EllipsePool}.tsx` (modify) | Read `shape.materialSlots` and use the resolved material. |
| `src/components/editor/ClientCommandHandlers.tsx` (modify) | `set.shape.material` and `pool.material.set` write to the store. |
| `src/components/editor/shell/inspector/MaterialSection.tsx` (modify) | Delete `PLACEHOLDER_OPTIONS`; render real `Material` rows with real prices. |
| `src/components/editor/shell/materials/MaterialGrid.tsx` (modify) | Cards dispatch `set.shape.material` against the selection. |
| `src/modules/pricing/engine.ts` (modify) | Material-driven line items: chosen interior/coping/deck material selects the price-book item. |
| `prisma/seed.ts` (modify) | Seed `Material` rows whose `fillSpec` carries colour/roughness and a `priceBookItemName` link. |

---

### Task 1: Material spec — one parser for fillSpec

**Files:**
- Create: `src/modules/materials/index.ts`
- Test: `src/test/unit/materials.test.ts`

**Interfaces:**
- Produces:
  - `interface MaterialSpec { color: string; roughness: number; metalness: number; transmission?: number; opacity?: number; textureUrl?: string; priceBookItemName?: string }`
  - `parseFillSpec(json: unknown): MaterialSpec` — never throws; defaults `{ color: '#9CA3AF', roughness: 0.8, metalness: 0 }`
  - `interface MaterialLite { id: string; kind: MaterialKind; name: string; spec: MaterialSpec }`
  - `materialForSlot(materials: readonly MaterialLite[], slots: MaterialSlots | undefined, slot: MaterialSlot): MaterialLite | null`

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MaterialKind } from '@prisma/client'
import { materialForSlot, parseFillSpec, type MaterialLite } from '@/modules/materials'

const pebble: MaterialLite = {
  id: 'mat-pebble',
  kind: MaterialKind.CUSTOM,
  name: 'Pebble Sheen Blue',
  spec: { color: '#1F3D6E', roughness: 0.45, metalness: 0 },
}

describe('parseFillSpec', () => {
  it('returns a usable default for junk input', () => {
    expect(parseFillSpec(null)).toEqual({ color: '#9CA3AF', roughness: 0.8, metalness: 0 })
    expect(parseFillSpec('nope')).toEqual({ color: '#9CA3AF', roughness: 0.8, metalness: 0 })
  })

  it('reads colour, roughness, and the price-book link', () => {
    const spec = parseFillSpec({
      color: '#1F3D6E',
      roughness: 0.45,
      priceBookItemName: 'Pebble interior finish',
    })
    expect(spec.color).toBe('#1F3D6E')
    expect(spec.roughness).toBe(0.45)
    expect(spec.priceBookItemName).toBe('Pebble interior finish')
  })

  it('clamps roughness and metalness into 0..1', () => {
    expect(parseFillSpec({ roughness: 5, metalness: -2 })).toMatchObject({
      roughness: 1,
      metalness: 0,
    })
  })
})

describe('materialForSlot', () => {
  it('returns null when the slot is unset', () => {
    expect(materialForSlot([pebble], undefined, 'interior')).toBeNull()
    expect(materialForSlot([pebble], {}, 'interior')).toBeNull()
  })

  it('resolves the id stored on the slot', () => {
    expect(materialForSlot([pebble], { interior: 'mat-pebble' }, 'interior')).toBe(pebble)
  })

  it('returns null when the stored id no longer exists', () => {
    expect(materialForSlot([pebble], { interior: 'deleted' }, 'interior')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/materials.test.ts`
Expected: FAIL — `Failed to resolve import "@/modules/materials"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/materials/index.ts`:

```ts
// `Material.fillSpec` is untyped Json in the schema, so every reader must treat
// it as untrusted. One parser, defaults that always render something visible.

import type { MaterialKind } from '@prisma/client'
import type { MaterialSlot, MaterialSlots } from '@/modules/editor/state/shapes'

export interface MaterialSpec {
  color: string
  roughness: number
  metalness: number
  transmission?: number
  opacity?: number
  textureUrl?: string
  /** Links the material to a `PriceBookItem.name` so choosing it moves the quote. */
  priceBookItemName?: string
}

export interface MaterialLite {
  id: string
  kind: MaterialKind
  name: string
  spec: MaterialSpec
}

const DEFAULT_SPEC: MaterialSpec = { color: '#9CA3AF', roughness: 0.8, metalness: 0 }

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export function parseFillSpec(json: unknown): MaterialSpec {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ...DEFAULT_SPEC }
  const raw = json as Record<string, unknown>

  const spec: MaterialSpec = {
    color: str(raw.color) ?? DEFAULT_SPEC.color,
    roughness: clamp01(num(raw.roughness, DEFAULT_SPEC.roughness)),
    metalness: clamp01(num(raw.metalness, DEFAULT_SPEC.metalness)),
  }
  // Assign optionals conditionally — `exactOptionalPropertyTypes` rejects
  // writing the key as `undefined`.
  if (typeof raw.transmission === 'number') spec.transmission = clamp01(raw.transmission)
  if (typeof raw.opacity === 'number') spec.opacity = clamp01(raw.opacity)
  const textureUrl = str(raw.textureUrl)
  if (textureUrl) spec.textureUrl = textureUrl
  const priceBookItemName = str(raw.priceBookItemName)
  if (priceBookItemName) spec.priceBookItemName = priceBookItemName
  return spec
}

export function materialForSlot(
  materials: readonly MaterialLite[],
  slots: MaterialSlots | undefined,
  slot: MaterialSlot,
): MaterialLite | null {
  const id = slots?.[slot]
  if (!id) return null
  return materials.find((m) => m.id === id) ?? null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/materials.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/materials/index.ts src/test/unit/materials.test.ts
git commit -m "feat(materials): typed fillSpec parser and slot resolver"
```

---

### Task 2: The command handlers write to the store

**Files:**
- Modify: `src/components/editor/ClientCommandHandlers.tsx:186-193` (`set.shape.material`) and `:223-230` (`pool.material.set`)
- Modify: `src/modules/commands/categories/shape.ts` (input schemas: add the `slot` enum to `set.shape.material`)
- Test: `src/test/unit/commands/material-handlers.test.ts`

**Interfaces:**
- Consumes: `useShapesStore` from `@/modules/editor/state/shapesStore`; `MaterialSlot` from Wave 0.
- Produces: after dispatch, `useShapesStore.getState().shapes.find(s => s.id === id)?.materialSlots?.[slot] === materialId`.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/commands/material-handlers.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ShapeKind } from '@prisma/client'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { applyMaterialSlot } from '@/modules/editor/state/materialSlots'

beforeEach(() => {
  useShapesStore.getState().hydrate([
    {
      id: 'pool-1',
      kind: ShapeKind.RECTANGLE_POOL,
      x: 0,
      y: 0,
      width: 300,
      height: 144,
      rotation: 0,
      zIndex: 1,
      locked: false,
      hidden: false,
      depthShallow: 3,
      depthDeep: 5,
    },
  ])
})

describe('applyMaterialSlot', () => {
  it('writes the material id into the named slot', () => {
    applyMaterialSlot('pool-1', 'interior', 'mat-pebble')
    expect(useShapesStore.getState().shapes[0]?.materialSlots).toEqual({ interior: 'mat-pebble' })
  })

  it('keeps other slots when a second slot is set', () => {
    applyMaterialSlot('pool-1', 'interior', 'mat-pebble')
    applyMaterialSlot('pool-1', 'coping', 'mat-travertine')
    expect(useShapesStore.getState().shapes[0]?.materialSlots).toEqual({
      interior: 'mat-pebble',
      coping: 'mat-travertine',
    })
  })

  it('is a no-op for an unknown shape id', () => {
    applyMaterialSlot('nope', 'interior', 'mat-pebble')
    expect(useShapesStore.getState().shapes[0]?.materialSlots).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/commands/material-handlers.test.ts`
Expected: FAIL — `Failed to resolve import "@/modules/editor/state/materialSlots"`.

- [ ] **Step 3: Write the store mutation**

Create `src/modules/editor/state/materialSlots.ts`:

```ts
'use client'

import { useShapesStore } from './shapesStore'
import type { MaterialSlot } from './shapes'

/**
 * Merge a material into one slot, preserving the others. Extracted from the
 * command handler so it is testable without a fetch round-trip.
 */
export function applyMaterialSlot(
  shapeId: string,
  slot: MaterialSlot,
  materialId: string,
): void {
  const store = useShapesStore.getState()
  const shape = store.shapes.find((s) => s.id === shapeId)
  if (!shape) return
  store.updateShape(shapeId, {
    materialSlots: { ...(shape.materialSlots ?? {}), [slot]: materialId },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/commands/material-handlers.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire both command handlers**

In `src/components/editor/ClientCommandHandlers.tsx`, replace the two echoing handlers:

```tsx
    registerClientHandler<
      { id: string; slot?: MaterialSlot; materialId: string },
      { id: string; slot: MaterialSlot; materialId: string }
    >('set.shape.material', (input) => {
      const slot = input.slot ?? 'interior'
      applyMaterialSlot(input.id, slot, input.materialId)
      return { id: input.id, slot, materialId: input.materialId }
    })

    registerClientHandler<
      { id: string; slot: MaterialSlot; materialId: string },
      { id: string; slot: MaterialSlot; materialId: string }
    >('pool.material.set', (input) => {
      applyMaterialSlot(input.id, input.slot, input.materialId)
      return { id: input.id, slot: input.slot, materialId: input.materialId }
    })
```

Add the imports:

```tsx
import { applyMaterialSlot } from '@/modules/editor/state/materialSlots'
import type { MaterialSlot } from '@/modules/editor/state/shapes'
```

In `src/modules/commands/categories/shape.ts`, widen the `set.shape.material` input schema and align `pool.material.set` with the four-slot vocabulary:

```ts
  inputSchema: z.object({
    id: z.string().min(1),
    slot: z.enum(['interior', 'coping', 'tileBand', 'deck']).optional(),
    materialId: z.string().min(1),
  }),
```

- [ ] **Step 6: Verify the whole suite**

Run: `pnpm typecheck && pnpm test`
Expected: clean. The existing `commands.test.ts` catalog assertions still pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/editor/state/materialSlots.ts src/components/editor/ClientCommandHandlers.tsx src/modules/commands/categories/shape.ts src/test/unit/commands/material-handlers.test.ts
git commit -m "feat(materials): material commands write to the shape instead of echoing"
```

---

### Task 3: The scene renders the chosen material

**Files:**
- Modify: `src/components/editor/three/Materials.ts`
- Modify: `src/components/editor/three/objects/PoolWalls.tsx`, `Water.tsx`, `Coping.tsx`, `TileBand.tsx`, `Deck.tsx`, `EllipsePool.tsx`
- Create: `src/components/editor/three/useSlotMaterial.ts`
- Test: `src/test/unit/three/materials.test.ts`

**Interfaces:**
- Consumes: `MaterialSpec`, `MaterialLite`, `materialForSlot` (Task 1).
- Produces:
  - `materialFromSpec(spec: MaterialSpec): THREE.Material` — memoised by a spec key so N shapes sharing a finish share one GPU material.
  - `useMaterialsStore` (Zustand) holding the org's `MaterialLite[]`, hydrated from the editor page's existing `materials` prop.
  - `useSlotMaterial(shape: Shape, slot: MaterialSlot, fallback: THREE.Material): THREE.Material`

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/three/materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { materialFromSpec } from '@/components/editor/three/Materials'

describe('materialFromSpec', () => {
  it('builds a material with the spec colour and roughness', () => {
    const mat = materialFromSpec({ color: '#1F3D6E', roughness: 0.45, metalness: 0 })
    expect(mat).toBeDefined()
    expect((mat as { roughness?: number }).roughness).toBe(0.45)
  })

  it('returns the same instance for the same spec', () => {
    const spec = { color: '#1F3D6E', roughness: 0.45, metalness: 0 }
    expect(materialFromSpec(spec)).toBe(materialFromSpec({ ...spec }))
  })

  it('returns a physical material when the spec is transmissive', () => {
    const mat = materialFromSpec({ color: '#38BDF8', roughness: 0.05, metalness: 0, transmission: 0.6 })
    expect((mat as { transmission?: number }).transmission).toBe(0.6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/three/materials.test.ts`
Expected: FAIL — `materialFromSpec is not a function`.

- [ ] **Step 3: Implement the factory**

Append to `src/components/editor/three/Materials.ts`:

```ts
import type { MaterialSpec } from '@/modules/materials'

const _specCache = new Map<string, THREE.Material>()

function specKey(spec: MaterialSpec): string {
  return [
    spec.color,
    spec.roughness,
    spec.metalness,
    spec.transmission ?? '',
    spec.opacity ?? '',
    spec.textureUrl ?? '',
  ].join('|')
}

/**
 * Build (and cache) a three.js material for a `MaterialSpec`. Cached by value
 * so twenty shapes on the same finish share one GPU material.
 */
export function materialFromSpec(spec: MaterialSpec): THREE.Material {
  const key = specKey(spec)
  const hit = _specCache.get(key)
  if (hit) return hit

  const transmissive = spec.transmission != null && spec.transmission > 0
  const material = transmissive
    ? new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        transmission: spec.transmission ?? 0,
        transparent: true,
        opacity: spec.opacity ?? 1,
        ior: 1.33,
      })
    : new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        ...(spec.opacity != null ? { transparent: true, opacity: spec.opacity } : {}),
      })

  material.name = `spec:${key}`
  _specCache.set(key, material)
  return material
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/three/materials.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Hydrate the org's materials into a store and consume them**

Create `src/modules/editor/state/materialsStore.ts`:

```ts
'use client'

import { create } from 'zustand'
import type { MaterialLite } from '@/modules/materials'

interface MaterialsState {
  materials: MaterialLite[]
  hydrate: (materials: MaterialLite[]) => void
}

export const useMaterialsStore = create<MaterialsState>((set) => ({
  materials: [],
  hydrate: (materials) => set({ materials }),
}))
```

Create `src/components/editor/three/useSlotMaterial.ts`:

```ts
'use client'

import type * as THREE from 'three'
import { materialForSlot } from '@/modules/materials'
import { useMaterialsStore } from '@/modules/editor/state/materialsStore'
import type { MaterialSlot, Shape } from '@/modules/editor/state/shapes'
import { materialFromSpec } from './Materials'

/** The material a shape's slot resolves to, or `fallback` when unset. */
export function useSlotMaterial(
  shape: Shape,
  slot: MaterialSlot,
  fallback: THREE.Material,
): THREE.Material {
  const materials = useMaterialsStore((s) => s.materials)
  const chosen = materialForSlot(materials, shape.materialSlots, slot)
  return chosen ? materialFromSpec(chosen.spec) : fallback
}
```

Then in each object component, replace the hardcoded material with the hook. `PoolWalls.tsx` and `EllipsePool.tsx` use `'interior'`, `Coping.tsx` uses `'coping'`, `TileBand.tsx` uses `'tileBand'`, `Deck.tsx` uses `'deck'`, `Water.tsx` keeps `waterDefault` until Wave 3's water shader. For example, in `EllipsePool.tsx` replace:

```tsx
  const plaster = getMaterial(materialId ?? 'pebbletecBlueGranite')
```

with:

```tsx
  const plaster = useSlotMaterial(shape, 'interior', pebbletecBlueGranite)
```

Finally, hydrate the store: in `src/components/editor/shell/EditorLayout.tsx` the `materials` prop already arrives from the page. Add a mount effect component `src/components/editor/MaterialsHydrator.tsx` that maps `RawMaterial[] → MaterialLite[]` via `parseFillSpec` and calls `useMaterialsStore.getState().hydrate(...)`, and render it next to `<EditorPersistence />`.

- [ ] **Step 6: Verify in the running app**

```bash
pnpm db:up && PORT=3007 pnpm dev
```

Open the editor, select the pool, pick a different interior finish. Expected: the basin colour changes immediately; reload the page and it is still the chosen finish (proving `materialSlots` persisted through `Drawing.rootJson`).

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/three/Materials.ts src/components/editor/three/useSlotMaterial.ts src/modules/editor/state/materialsStore.ts src/components/editor/MaterialsHydrator.tsx src/components/editor/three/objects src/components/editor/shell/EditorLayout.tsx src/test/unit/three/materials.test.ts
git commit -m "feat(materials): render the chosen material in the scene"
```

---

### Task 4: Real options in the inspector and the material grid

**Files:**
- Modify: `src/components/editor/shell/inspector/MaterialSection.tsx` (delete `PLACEHOLDER_OPTIONS`, lines ~60-138)
- Modify: `src/components/editor/shell/materials/MaterialGrid.tsx`, `MaterialCard.tsx`
- Test: `src/test/unit/inspector/MaterialSection.test.tsx`

**Interfaces:**
- Consumes: `useMaterialsStore`, `materialForSlot`, `useSelectionStore`.
- Produces: no new exports; the section renders one row per `MaterialSlot`, each listing the org's materials of the matching `MaterialKind`, with the price taken from the linked price-book item (`spec.priceBookItemName`) — never an invented literal.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/inspector/MaterialSection.test.tsx` following the pattern in `src/test/unit/inspector/PositionSection.test.tsx`. Assert: with two seeded materials in the store and a pool selected, both material names appear; the hardcoded string `'Pebble Sheen — Blue Granite'` from `PLACEHOLDER_OPTIONS` does **not**; clicking a row dispatches `pool.material.set` with that material's id.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/inspector/MaterialSection.test.tsx`
Expected: FAIL — the placeholder name is still rendered.

- [ ] **Step 3: Replace the placeholder data**

Delete the `PLACEHOLDER_OPTIONS` constant and derive rows from `useMaterialsStore`, filtering by the slot's `MaterialKind` (`interior → CUSTOM`, `coping → COPING`, `tileBand → CUSTOM`, `deck → CONCRETE_DECK | PAVER_DECK`). Show the price only when `spec.priceBookItemName` resolves against the price book passed into the editor; otherwise show no price rather than a fake one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/inspector/MaterialSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/shell/inspector/MaterialSection.tsx src/components/editor/shell/materials src/test/unit/inspector/MaterialSection.test.tsx
git commit -m "feat(materials): real material options in the inspector and grid"
```

---

### Task 5: Material choice reaches the quote and the packet

**Files:**
- Modify: `src/modules/pricing/engine.ts`
- Modify: `src/components/exports/ConstructionDocument.tsx` (materials section)
- Test: `src/test/unit/pricing-materials.test.ts`

**Interfaces:**
- Consumes: `MaterialLite`, `materialForSlot`.
- Produces: `PricingSelections` gains `materials?: { interior?: string; coping?: string; tileBand?: string; deck?: string }` carrying **price-book item names** resolved from the chosen materials, and `quantityForItem` prefers an item whose name matches the chosen material for the POOL / COPING / DECK categories.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/pricing-materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PriceCategory, UnitType } from '@prisma/client'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'

const measurements = { poolSurfaceArea: 300, copingLinearFeet: 74, deckArea: 500, hasPool: true } as MeasurementSummary

const items: PriceBookItemLite[] = [
  { id: 'a', category: PriceCategory.COPING, name: 'Travertine coping', unitType: UnitType.LF, retailPrice: 42 },
  { id: 'b', category: PriceCategory.COPING, name: 'Cantilever concrete coping', unitType: UnitType.LF, retailPrice: 26 },
]

describe('material-driven pricing', () => {
  it('prices only the chosen coping, not every coping item', () => {
    const quote = computeQuote(items, measurements, { materials: { coping: 'Travertine coping' } })
    expect(quote.lineItems.map((l) => l.name)).toEqual(['Travertine coping'])
    expect(quote.lineItems[0]?.quantity).toBe(74)
  })

  it('falls back to every item in the category when nothing is chosen', () => {
    const quote = computeQuote(items, measurements, {})
    expect(quote.lineItems).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/pricing-materials.test.ts`
Expected: FAIL — both items priced in the first case.

- [ ] **Step 3: Implement selection-aware pricing**

In `quantityForItem`, for `POOL` / `COPING` / `DECK`, when `sel.materials?.<slot>` is set and does not equal `item.name`, return `{ quantity: 0, source: 'Not selected' }`. When it matches, keep today's measurement-driven quantity.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/pricing-materials.test.ts && pnpm test`
Expected: both PASS — including the existing pricing tests, which pass no `materials` and must be unaffected.

- [ ] **Step 5: Print the chosen materials on the construction packet**

In `ConstructionDocument.tsx`, source the "Interior finish", "Coping", and "Deck material" rows from the resolved material names when present, falling back to the descriptive `poolFields` strings.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pricing/engine.ts src/components/exports/ConstructionDocument.tsx src/test/unit/pricing-materials.test.ts
git commit -m "feat(materials): chosen materials drive the quote and the packet"
```

---

## Track exit criteria

- [ ] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` clean.
- [ ] `grep -r PLACEHOLDER_OPTIONS src` returns nothing.
- [ ] Manual: pick an interior finish → scene changes → reload → still applied → appears on the construction packet → the quote line for that finish changes.
