# Wave 1 / Track 4 — Direct Manipulation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resize and rotate on the canvas, select several shapes at once, and make every keyboard shortcut either work or disappear from the table.

**Architecture:** A gizmo component owns handle geometry and pointer maths, dispatching the existing `resize.shape` / `rotate.shape` commands so undo and audit come free. Hotkeys get a real binder that walks the existing `HOTKEYS` table. The tool-id vocabulary gets reconciled — `HOTKEYS` says `'move'`, `DragHandler` accepts `'select' | 'tool.select'`, and the tools catalog says `'tool.select'`; today nothing binds the keys so the mismatch is invisible, and binding them without fixing it would break dragging.

**Tech Stack:** three.js raycasting, Zustand, Vitest.

## Global Constraints

See `2026-07-24-world-class-roadmap.md` → Global Constraints. Specific to this track:

- Gizmo drags must be wrapped in `useShapesStore.getState().beginTransaction()` / `commitTransaction()` so a whole drag is one undo entry.
- Do **not** dispatch per pointermove. Follow `lib/commands/dispatch.ts`: mutate the store live, dispatch the command once on pointerup.
- `e.stopImmediatePropagation()` on gizmo pointerdown, exactly as `DragHandler` does, or `CustomOrbit` will also treat it as a camera drag.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/modules/editor/tools/ids.ts` (create) | One canonical `ToolId` union + `normalizeToolId()`. Ends the `'move'` vs `'tool.select'` split. |
| `src/components/editor/three/TransformGizmo.tsx` (create) | Corner resize handles + a rotate ring for the current selection. |
| `src/components/editor/three/gizmoMath.ts` (create) | Pure handle maths — resize from a corner drag, angle from a ring drag. Unit-tested without three.js. |
| `src/components/editor/three/SceneCanvas.tsx` (modify) | Mount `<TransformGizmo />`. |
| `src/components/editor/three/ToolGestures.tsx` (modify) | Marquee selection on drag over empty ground. |
| `src/components/editor/HotkeyBinder.tsx` (create) | Binds `HOTKEYS` to `window`, with input-focus and modifier guards. |
| `src/modules/editor/hotkeys/index.ts` (modify) | Remove entries with no implementation; point tool entries at canonical ids. |
| `src/components/editor/shell/EditorLayout.tsx` (modify) | Mount `<HotkeyBinder />`. |

---

### Task 1: Canonical tool ids

**Files:**
- Create: `src/modules/editor/tools/ids.ts`
- Modify: `src/modules/editor/hotkeys/index.ts`, `src/components/editor/three/DragHandler.tsx:59-60`, `src/components/editor/three/ToolGestures.tsx`
- Test: `src/test/unit/tool-ids.test.ts`

**Interfaces:**
- Produces:
  - `type ToolId = 'tool.select' | 'tool.pan' | 'tool.pool-shape' | 'tool.steps' | 'tool.water-feature' | 'tool.lights' | 'tool.deck' | 'tool.material-brush' | 'tool.measure' | 'tool.annotation' | 'tool.comment'`
  - `normalizeToolId(raw: string): ToolId | null` — maps legacy spellings (`'move'`, `'select'`, `'pan'`, `'pool-shape'`, …) onto the canonical id.
  - `DEFAULT_TOOL: ToolId = 'tool.select'`

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/tool-ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOL, normalizeToolId } from '@/modules/editor/tools/ids'
import { HOTKEYS } from '@/modules/editor/hotkeys'

describe('normalizeToolId', () => {
  it('maps the legacy names the hotkey table uses', () => {
    expect(normalizeToolId('move')).toBe('tool.select')
    expect(normalizeToolId('select')).toBe('tool.select')
    expect(normalizeToolId('pan')).toBe('tool.pan')
    expect(normalizeToolId('pool-shape')).toBe('tool.pool-shape')
  })

  it('passes canonical ids through', () => {
    expect(normalizeToolId('tool.measure')).toBe('tool.measure')
  })

  it('returns null for an unknown tool', () => {
    expect(normalizeToolId('tool.teleport')).toBeNull()
  })

  it('defaults to select', () => {
    expect(DEFAULT_TOOL).toBe('tool.select')
  })
})

describe('the hotkey table', () => {
  it('names a tool every tool.activate entry can resolve', () => {
    for (const hk of HOTKEYS) {
      if (hk.commandId !== 'tool.activate') continue
      const tool = (hk.input as { tool?: string } | undefined)?.tool
      expect(tool, `${hk.shortcut} has no tool input`).toBeDefined()
      expect(normalizeToolId(tool!), `${hk.shortcut} names unknown tool ${tool}`).not.toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/tool-ids.test.ts`
Expected: FAIL — `Failed to resolve import "@/modules/editor/tools/ids"`.

- [ ] **Step 3: Implement and adopt**

Write `ids.ts` with an alias map. Then:
- `ClientCommandHandlers.tsx`'s `tool.activate` handler calls `normalizeToolId(input.tool) ?? DEFAULT_TOOL` before `setActiveTool`.
- `DragHandler.tsx` replaces `if (tool !== 'tool.select' && tool !== 'select') return` with `if (normalizeToolId(tool) !== 'tool.select') return`.
- `ToolGestures.tsx` compares through `normalizeToolId` too.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/tool-ids.test.ts && pnpm test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/editor/tools/ids.ts src/modules/editor/hotkeys/index.ts src/components/editor/three/DragHandler.tsx src/components/editor/three/ToolGestures.tsx src/components/editor/ClientCommandHandlers.tsx src/test/unit/tool-ids.test.ts
git commit -m "refactor(editor): one canonical tool id vocabulary"
```

---

### Task 2: Gizmo maths

**Files:**
- Create: `src/components/editor/three/gizmoMath.ts`
- Test: `src/test/unit/three/gizmoMath.test.ts`

**Interfaces:**
- Produces:
  - `type Corner = 'nw' | 'ne' | 'se' | 'sw'`
  - `interface Box { x: number; y: number; width: number; height: number }` (inches)
  - `resizeFromCorner(box: Box, corner: Corner, groundX: number, groundY: number, opts?: { lockRatio?: boolean; minSize?: number }): Box`
  - `rotationFromPointer(box: Box, groundX: number, groundY: number, opts?: { snapDegrees?: number }): number` — degrees, 0 = unrotated
  - `MIN_SHAPE_SIZE_IN = 12`

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/three/gizmoMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIN_SHAPE_SIZE_IN, resizeFromCorner, rotationFromPointer } from '@/components/editor/three/gizmoMath'

const box = { x: 0, y: 0, width: 240, height: 120 }

describe('resizeFromCorner', () => {
  it('drags the SE corner to the pointer', () => {
    expect(resizeFromCorner(box, 'se', 300, 200)).toEqual({ x: 0, y: 0, width: 300, height: 200 })
  })

  it('drags the NW corner and moves the origin', () => {
    expect(resizeFromCorner(box, 'nw', 60, 30)).toEqual({ x: 60, y: 30, width: 180, height: 90 })
  })

  it('never shrinks below the minimum size', () => {
    const result = resizeFromCorner(box, 'se', -500, -500)
    expect(result.width).toBe(MIN_SHAPE_SIZE_IN)
    expect(result.height).toBe(MIN_SHAPE_SIZE_IN)
  })

  it('preserves the aspect ratio when locked', () => {
    const result = resizeFromCorner(box, 'se', 480, 130, { lockRatio: true })
    expect(result.width / result.height).toBeCloseTo(240 / 120, 6)
  })
})

describe('rotationFromPointer', () => {
  it('reports 0 degrees straight above the centre', () => {
    expect(rotationFromPointer(box, 120, -100)).toBeCloseTo(0, 6)
  })

  it('reports 90 degrees to the right of the centre', () => {
    expect(rotationFromPointer(box, 400, 60)).toBeCloseTo(90, 6)
  })

  it('snaps to 15 degree increments when asked', () => {
    expect(rotationFromPointer(box, 400, 20, { snapDegrees: 15 }) % 15).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/three/gizmoMath.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the maths**

Pure functions, no three.js import — the gizmo component converts scene coordinates to drawing inches before calling in. Clamp with `MIN_SHAPE_SIZE_IN = 12` (one foot). For `lockRatio`, take the dominant axis of the drag and derive the other from the original ratio.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/three/gizmoMath.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/three/gizmoMath.ts src/test/unit/three/gizmoMath.test.ts
git commit -m "feat(editor): pure resize and rotate maths for the transform gizmo"
```

---

### Task 3: The gizmo itself

**Files:**
- Create: `src/components/editor/three/TransformGizmo.tsx`
- Modify: `src/components/editor/three/SceneCanvas.tsx`
- Test: manual

**Interfaces:**
- Consumes: `gizmoMath`, `useSelectionStore`, `useShapesStore`, `dispatchEphemeral`, the ground-projection helper already used by `DragHandler`.
- Produces: `TransformGizmo()` — renders nothing when the selection is empty or multi.

- [ ] **Step 1: Build it**

Render four small boxes at the selected shape's corners plus a torus ring above it, all in a group rotated by the shape's rotation. On pointerdown over a handle: `stopImmediatePropagation`, `beginTransaction()`, record which corner. On pointermove: project to ground, call `resizeFromCorner` / `rotationFromPointer`, and `updateShape` directly (no dispatch — this is the live-feedback path). On pointerup: `commitTransaction()` and dispatch once:

```tsx
        dispatchEphemeral('resize.shape', { id: shape.id, width: next.width, height: next.height })
        // or
        dispatchEphemeral('rotate.shape', { id: shape.id, degrees: next })
```

Hold `Shift` during a corner drag → `lockRatio: true`. Hold `Shift` during a ring drag → `snapDegrees: 15`.

- [ ] **Step 2: Mount it**

Add `<TransformGizmo />` to `SceneCanvas.tsx` after `<SelectionHalo />`.

- [ ] **Step 3: Verify in the running app**

```bash
pnpm db:up && PORT=3007 pnpm dev
```

Select the pool. Expected: four corner handles and a rotate ring. Drag a corner — the pool resizes live, the measurement panel updates, the camera does not move. Release, then ⌘Z once — the whole drag undoes in a single step. Check `CommandAuditLog` has exactly one `resize.shape` row for the drag:

```bash
docker exec poolforge-postgres psql -U pool -d poolforge -t -A -c \
  "select \"commandId\", count(*) from \"CommandAuditLog\" where \"ranAt\" > now() - interval '2 minutes' group by 1;"
```

Expected: `resize.shape|1`, not dozens.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/three/TransformGizmo.tsx src/components/editor/three/SceneCanvas.tsx
git commit -m "feat(editor): on-canvas resize and rotate gizmo"
```

---

### Task 4: Marquee multi-select

**Files:**
- Modify: `src/components/editor/three/ToolGestures.tsx`
- Create: `src/components/editor/three/marquee.ts`
- Test: `src/test/unit/three/marquee.test.ts`

**Interfaces:**
- Produces: `shapesInMarquee(shapes: readonly Shape[], rect: { x0: number; y0: number; x1: number; y1: number }): string[]` — drawing-space inches, returns ids of shapes whose bounding box **intersects** the rect (not merely contains, which is unusable at small marquee sizes).

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/three/marquee.test.ts` asserting: a rect overlapping one of three shapes returns just that id; a rect covering all returns all three in z-order; a rect touching nothing returns `[]`; hidden and locked shapes are excluded.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/three/marquee.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement and wire**

Write the intersection test, then in `ToolGestures.tsx`, when the select tool is active and the pointer goes down on empty ground, track the rect, draw it as an overlay, and on pointerup dispatch `selection.set` with the resulting ids. Shift is taken by the camera for panning, so additive marquee uses `Alt`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/three/marquee.test.ts && pnpm test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/three/marquee.ts src/components/editor/three/ToolGestures.tsx src/test/unit/three/marquee.test.ts
git commit -m "feat(editor): marquee multi-select"
```

---

### Task 5: Bind the hotkeys — or delete them

**Files:**
- Create: `src/components/editor/HotkeyBinder.tsx`
- Modify: `src/modules/editor/hotkeys/index.ts`
- Modify: `src/components/editor/shell/EditorLayout.tsx`
- Test: `src/test/unit/hotkeys.test.ts`

**Interfaces:**
- Consumes: `HOTKEYS`, `dispatchEphemeral`, `hasClientHandler` from `@/lib/commands/dispatch`.
- Produces: `HotkeyBinder({ projectId }: { projectId: string })`; `matchShortcut(event, shortcut): boolean` exported from `hotkeys/index.ts` for testing.

- [ ] **Step 1: Write the failing test**

Create `src/test/unit/hotkeys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HOTKEYS, matchShortcut } from '@/modules/editor/hotkeys'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'

initCommands()

function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('matchShortcut', () => {
  it('matches a plain key', () => {
    expect(matchShortcut(key({ key: 'v' }), 'v')).toBe(true)
    expect(matchShortcut(key({ key: 'v', metaKey: true }), 'v')).toBe(false)
  })

  it('treats mod as meta or ctrl', () => {
    expect(matchShortcut(key({ key: 'z', metaKey: true }), 'mod+z')).toBe(true)
    expect(matchShortcut(key({ key: 'z', ctrlKey: true }), 'mod+z')).toBe(true)
    expect(matchShortcut(key({ key: 'z' }), 'mod+z')).toBe(false)
  })

  it('distinguishes mod+shift from mod', () => {
    expect(matchShortcut(key({ key: 'z', metaKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true)
    expect(matchShortcut(key({ key: 'z', metaKey: true, shiftKey: true }), 'mod+z')).toBe(false)
  })
})

// The point of this track: a shortcut in the table that dispatches a command
// nobody implements is worse than no shortcut, because it teaches the user the
// app is broken.
describe('every hotkey resolves to a command that does something', () => {
  it.each(HOTKEYS)('$shortcut → $commandId', (hk) => {
    expect(get(hk.commandId), `${hk.commandId} is not registered`).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/test/unit/hotkeys.test.ts`
Expected: FAIL twice — `matchShortcut` is not exported, and several table entries name unregistered commands (`shape.copy`, `shape.paste`, `shape.group`, `shape.ungroup`, `canvas.zoom.in`, `canvas.zoom.out`, `canvas.fit`, `history.undo`, `history.redo` — confirm the exact list from the failure output).

- [ ] **Step 3: Make the table honest**

For each failing entry, choose one and do it in this commit:
- **Implement** it if the underlying capability already exists — `history.undo` / `history.redo` map straight onto `useHistoryStore`, and `canvas.zoom.in` / `canvas.zoom.out` / `canvas.fit` onto `useCameraStore`. Register the command with a real `execute` (audit-only) plus a client handler in `ClientCommandHandlers.tsx`.
- **Delete** it from `HOTKEYS` if it does not — clipboard and grouping have no implementation anywhere; remove those four rows rather than shipping keys that do nothing.

- [ ] **Step 4: Write the binder**

Create `src/components/editor/HotkeyBinder.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { dispatchEphemeral } from '@/lib/commands/dispatch'
import { HOTKEYS, matchShortcut } from '@/modules/editor/hotkeys'
import { isExportCommandId } from '@/modules/exports/routes'

/**
 * Binds the documented shortcut table to the window. Export shortcuts get the
 * projectId merged in, because export commands take the project they document.
 */
export function HotkeyBinder({ projectId }: { projectId: string }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never steal a key from a text field.
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      // The palette owns mod+k and Escape.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') return

      for (const hotkey of HOTKEYS) {
        if (!matchShortcut(event, hotkey.shortcut)) continue
        event.preventDefault()
        const input = (hotkey.input ?? {}) as Record<string, unknown>
        dispatchEphemeral(
          hotkey.commandId,
          isExportCommandId(hotkey.commandId) ? { ...input, projectId } : input,
        )
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectId])

  return null
}
```

Mount it in `EditorLayout.tsx` next to `<ClientCommandHandlers />`:

```tsx
      <HotkeyBinder projectId={projectId} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/test/unit/hotkeys.test.ts && pnpm test`
Expected: both PASS.

- [ ] **Step 6: Verify in the running app**

```bash
pnpm db:up && PORT=3007 pnpm dev
```

In the editor press: `1` / `2` / `3` (view tabs switch), `f` (frames the selection), `⌘E` (proposal opens in a new tab), `⌘Z` (undoes the last change), `v` then drag a selected shape (it moves — this is the regression Task 1 exists to prevent). Type into the rename field and press `d` — expected: the letter appears, no deck tool activates.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/HotkeyBinder.tsx src/modules/editor/hotkeys/index.ts src/components/editor/shell/EditorLayout.tsx src/components/editor/ClientCommandHandlers.tsx src/modules/commands/categories src/test/unit/hotkeys.test.ts
git commit -m "feat(editor): bind the hotkey table and delete the shortcuts that never worked"
```

---

## Track exit criteria

- [ ] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` clean.
- [ ] Every entry in `HOTKEYS` fires a registered command; none is a no-op.
- [ ] A corner drag produces exactly one audit row and one undo step.
- [ ] Marquee selects multiple shapes; the transform gizmo hides for a multi-selection rather than misbehaving.
