# Migration Contracts — Wave 1 Track Boundaries

This document is the single source of truth for the parallel Wave 1 tracks of the
MVP → real-deal editor migration. **Tracks may only modify files in their own
ownership list below.** Cross-track values flow only through the stores and
command IDs defined here.

- Plan: [/Users/b/.claude/plans/imperative-snuggling-hollerith.md](../../../.claude/plans/imperative-snuggling-hollerith.md)
- Spec: [/Users/b/Documents/Claude/Projects/pool-forge-maybe/pool-forge-spec.md](../../../Documents/Claude/Projects/pool-forge-maybe/pool-forge-spec.md)
- Prototype: [/Users/b/Documents/Claude/Projects/pool-forge-maybe/pool-forge-prototype.html](../../../Documents/Claude/Projects/pool-forge-maybe/pool-forge-prototype.html)

## Wave 0 deviations (locked)

1. **CSS variables are prefixed `--pf-*`** instead of bare `--accent`/`--canvas-bg`/etc., because the existing shadcn theme already defines `--accent`. The Tailwind tokens (`canvas`, `pfAccent`, `pfAccentStrong`, `pfAccentSoft`, `textMuted`, `textFaint`, `pfWarn`, `warnSoft`, `pfError`, `errorSoft`, `borderLight`, `rowHover`, `rowActive`) and shadow/radius ladders (`shadow-pf{Xs,Sm,Md,Lg}`, `rounded-pf{Xs,Sm,Md,Lg}`) reference these.
2. **Schema sync uses `pnpm db:push`**, not `prisma migrate dev`, because the project has no `prisma/migrations/` directory and the existing workflow is push-based.
3. **R3F majors:** `@react-three/fiber@^9.1` and `@react-three/drei@^10.7` (peer-deps require these on React 19).
4. **`suncalc` is not installed.** Track F may add it if real sunrise/sunset is wired; otherwise the existing constants (June 21, 6:21a–8:31p) stand.

## File ownership

### Track A — Shell

- `src/components/editor/shell/EditorLayout.tsx` (new)
- `src/components/editor/shell/HeaderBar.tsx` (new)
- `src/components/editor/shell/LeftPanel.tsx` (new)
- `src/components/editor/shell/RightPanel.tsx` (new)
- `src/components/editor/shell/CanvasOverlay.tsx` (new)
- `src/components/editor/EditorShell.tsx` (replace placeholder)
- `src/components/editor/index.ts` (re-export `EditorLayout`)
- `src/app/(app)/projects/[id]/editor/page.tsx` (modify imports only)

### Track B — R3F scene infrastructure

- `src/components/editor/three/SceneCanvas.tsx` (replace Wave 0 stub)
- `src/components/editor/three/Lighting.tsx` (new) — reads `useSunStore` selectors
- `src/components/editor/three/Ground.tsx` (new)
- `src/components/editor/three/CameraRig.tsx` (new) — reads `useViewStore.viewMode`
- `src/components/editor/three/CustomOrbit.tsx` (new) — reads `useCameraStore.transitionToken`
- `src/components/editor/three/Materials.ts` (new)
- `src/components/editor/three/SceneRoot.tsx` (new)

### Track C — Three.js mesh objects (16 files)

- `src/components/editor/three/objects/PoolWalls.tsx`
- `src/components/editor/three/objects/Water.tsx`
- `src/components/editor/three/objects/Coping.tsx`
- `src/components/editor/three/objects/TileBand.tsx`
- `src/components/editor/three/objects/SunShelf.tsx`
- `src/components/editor/three/objects/Steps.tsx`
- `src/components/editor/three/objects/Bubblers.tsx`
- `src/components/editor/three/objects/LedLights.tsx`
- `src/components/editor/three/objects/Drains.tsx`
- `src/components/editor/three/objects/Spa.tsx`
- `src/components/editor/three/objects/Spillover.tsx`
- `src/components/editor/three/objects/Deck.tsx`
- `src/components/editor/three/objects/HouseWall.tsx`
- `src/components/editor/three/objects/Trees.tsx`
- `src/components/editor/three/objects/EquipmentPad.tsx`
- `src/components/editor/three/objects/Loungers.tsx`

### Track D — Selection system

- `src/components/editor/three/SelectionPicker.tsx`
- `src/components/editor/three/SelectionHalo.tsx`
- `src/components/editor/three/SelectionLabel.tsx`
- `src/components/editor/shell/SelectionLabelOverlay.tsx`
- `src/components/editor/shell/ContextualToolbar.tsx`

### Track E — Inspector sections

- `src/components/editor/shell/inspector/SelectionCard.tsx`
- `src/components/editor/shell/inspector/PositionSection.tsx`
- `src/components/editor/shell/inspector/GeometrySection.tsx`
- `src/components/editor/shell/inspector/MaterialSection.tsx`
- `src/components/editor/shell/inspector/ComputedMetrics.tsx`
- `src/components/editor/shell/inspector/QuoteContribution.tsx`
- `src/test/unit/inspector/*.test.tsx` (optional)

### Track F — Floating overlays

- `src/components/editor/shell/SunDial.tsx` (also extends `sunStore` selectors)
- `src/components/editor/shell/ViewCube.tsx`
- `src/components/editor/shell/QuoteDock.tsx`
- `src/components/editor/shell/ValidationDock.tsx` (replaces existing thin wrapper at `src/components/editor/ValidationDock.tsx`)
- `src/components/editor/shell/ModePillContainer.tsx`
- `src/components/editor/shell/Toolbar.tsx`
- `src/modules/editor/state/sunStore.ts` (extend selectors only — do not remove exports)

### Track G — Command implementations

- `src/modules/commands/categories/shape.ts`
- `src/modules/commands/categories/canvas.ts`
- `src/modules/commands/categories/scene.ts`
- `src/modules/commands/categories/palette.ts`
- `src/test/unit/commands/shape.test.ts` (mandatory)
- `src/test/unit/commands/canvas.test.ts` (mandatory)

### Track H — Command palette + hotkeys

- `src/components/editor/shell/CommandPalette.tsx`
- `src/lib/commands/suggestions.ts`
- `src/modules/editor/hotkeys/index.ts`

## Store contracts

### `useViewStore` (`src/modules/editor/state/viewStore.ts`)

```ts
type ViewMode = 'plan' | '3d' | 'section'
type PresentationMode = 'plan' | 'design' | 'build' | 'customer'
type LeftTab = 'layers' | 'stencils' | 'materials'
type RightTab = 'design' | 'specs' | 'quote'

interface ViewState {
  viewMode: ViewMode            // default '3d'
  presentationMode: PresentationMode  // default 'design'
  leftTab: LeftTab              // default 'layers'
  rightTab: RightTab            // default 'design'
  setViewMode(m: ViewMode): void
  setPresentationMode(m: PresentationMode): void
  setLeftTab(t: LeftTab): void
  setRightTab(t: RightTab): void
}
```

### `useSunStore` (`src/modules/editor/state/sunStore.ts`)

```ts
interface SunState {
  minutesPastMidnight: number   // default 720 (noon)
  sunrise: number               // default 381 (6:21a)
  sunset: number                // default 1231 (8:31p)
  setMinutes(n: number): void
  setSunriseSunset(rise: number, set: number): void
}

selectSunDirection(s: SunState): [number, number, number]   // Wave 0 returns [0, 1, 0]
selectSunColor(s: SunState): [number, number, number]       // Wave 0 returns [1, 0.95, 0.85]
selectSunIntensity(s: SunState): number                     // Wave 0 returns 1.1
// Track F replaces the selector bodies with the day-arc math from prototype.html lines 2488–2508.
```

### `useCameraStore` (`src/modules/editor/state/cameraStore.ts`)

```ts
type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

interface CameraState {
  targetView: CameraView | null   // default null
  transitionToken: number          // default 0; bumped on every setView
  setView(v: CameraView): void
}
```

### `useScreenSelectionStore` (`src/modules/editor/state/screenSelectionStore.ts`)

```ts
interface ScreenSelectionState {
  x: number
  y: number
  visible: boolean
  setPosition(x: number, y: number): void
  setVisible(v: boolean): void
}
```

Track D's R3F `SelectionLabel` writes here every frame; Track A/D's
`SelectionLabelOverlay` (DOM) reads here and renders the pill at `[x, y]`.

### `useSelectionStore` (existing, `src/modules/editor/state/selectionStore.ts`)

Inspect the file directly — Track D and Track E both subscribe to it.
Multi-select set + add/remove/clear API; this is the single source of truth for
"what is selected" and is mirrored by the layers panel, halo, label, and
contextual toolbar.

### `useShapesStore` (existing, `src/modules/editor/state/shapesStore.ts`)

The in-memory authority during an editor session. `EditorPersistence` keeps it
synced to the DB.

## Command IDs

Newly registered in Wave 0 (executes return `{ ok: false, error: 'wave-1-pending' }`).
Track G fills the executes; other tracks may import the IDs as string constants.

| ID | Category | Input shape | Owner |
|---|---|---|---|
| `pool.geometry.update` | shape | `{ id, length?, width?, avgDepth?, shallowDepth?, deepDepth?, slope? }` | Track G |
| `pool.material.set` | shape | `{ id, slot: 'interior'\|'coping'\|'tileBand', materialId }` | Track G |
| `pool.depth.set` | shape | `{ id, shallowDepth?, deepDepth?, slope?, sunShelfElevation?, bubblerHeight? }` | Track G |
| `selection.set` | canvas | `{ ids: string[] }` | Track G |
| `camera.set.view` | canvas | `{ view: 'top'\|'front'\|'left'\|'right'\|'iso' }` | Track G |
| `camera.frame.selection` | canvas | `{}` | Track G |
| `mode.set.presentation` | canvas | `{ mode: 'plan'\|'design'\|'build'\|'customer' }` | Track G |
| `view.set.tab` | canvas | `{ tab: 'plan'\|'3d'\|'section' }` | Track G |
| `sun.set.time` | scene | `{ minutesPastMidnight: number }` | Track G |
| `sun.run.study` | scene | `{ durationMs?: number }` | Track G |
| `palette.open` | palette | `{ initialQuery?: string }` | Track G |
| `palette.run.suggestion` | palette | `{ suggestionId, innerCommandId, innerInput }` | Track G |

Existing command IDs (`add.shape`, `select.shape`, `move.shape`, `resize.shape`,
`rotate.shape`, `delete.shape`, `duplicate.shape`, `set.shape.material`,
`canvas.zoom.in`, `canvas.zoom.out`, `canvas.fit`, `canvas.pan`, etc.) all
return `not implemented` until Track G fills them.

## Slot interfaces

### `<RightPanel>` (Track A → Track E)

```tsx
interface RightPanelProps {
  selectionCardSlot?: React.ReactNode
  positionSlot?: React.ReactNode
  geometrySlot?: React.ReactNode
  materialSlot?: React.ReactNode
  computedMetricsSlot?: React.ReactNode
  quoteContributionSlot?: React.ReactNode
  // Tab strip is owned by RightPanel itself; the Specs/Quote panes can be empty
  // for v1 if Track E doesn't fill them.
}
```

### `<CanvasOverlay>` (Track A → Track F + Track D)

```tsx
interface CanvasOverlayProps {
  modePillSlot?: React.ReactNode        // Track F
  quoteDockSlot?: React.ReactNode       // Track F
  viewCubeSlot?: React.ReactNode        // Track F
  sunDialSlot?: React.ReactNode         // Track F
  toolbarSlot?: React.ReactNode         // Track F
  validationDockSlot?: React.ReactNode  // Track F
  selectionLabelSlot?: React.ReactNode  // Track D
  contextualToolbarSlot?: React.ReactNode  // Track D
  multiplayerCursorSlot?: React.ReactNode  // deferred (multiplayer not in v1)
}
```

`CanvasOverlay` is a `position: absolute; inset: 0; pointer-events: none` layer.
Each child opts back into pointer events.

## Track C object component contract

Every file under `src/components/editor/three/objects/` exports a default React
component matching this signature:

```ts
interface ObjectProps {
  shape: Shape          // from src/modules/editor/state/shapes.ts
  materialId?: string   // optional override; otherwise uses Materials registry default
}
```

**Invariant:** the root `THREE.Group` (or other top-level Object3D) **must** set
`userData.id = shape.id`. Track D's `SelectionPicker` walks the parent chain
until it finds a non-empty `userData.id`. Without this, picking is broken.

Materials reference the memoized registry at
`src/components/editor/three/Materials.ts` (Track B owns this file).

## `dispatch()` helper

```ts
type DispatchResult<O> = { ok: true; data: O } | { ok: false; error: string }

async function dispatch<I, O>(
  id: string,
  input: I,
): Promise<DispatchResult<O>>
```

POSTs to `/api/commands` (the existing route). Always emits an audit row.
Inspector inputs commit on `pointerUp`/`blur`/`Enter`; sliders use a
`useDebouncedCommit(800ms)` (Track E owns the hook). **Do not** call `dispatch()`
on every keystroke — `CommandAuditLog` will flood.

## Acceptance test commands

Each track must keep these green:

```sh
pnpm typecheck
pnpm test
```

Track G additionally adds:

```sh
pnpm test src/test/unit/commands/
```

Wave 2 adds:

```sh
pnpm test:e2e
pnpm electron:dev   # smoke
pnpm build          # bundle-size sanity
```
