# Polish Wave 1 — Contracts

Wave 0 established schema, command stubs, and cache helpers. Each track below owns a disjoint file set. **No track may modify files outside its list.** Cross-track values flow only through Wave 0 contracts.

## Wave 0 deliverables (already landed)

- **Prisma indexes**: `CommandAuditLog(userId, ranAt)`, `CommandAuditLog(orgId, commandId, ranAt)`, `Project(orgId, status, updatedAt)`, `OrganizationMember(userId)`, `Material(orgId, kind)`. Applied via `pnpm db:push`.
- **Electron AUTH_URL**: `electron/main.cjs` sets `process.env.AUTH_URL` from `IS_DEV ? DEV_URL : PROD_URL` before any Next.js process starts. `.env.example` documents the requirement.
- **ValidationItem**: `targetId?: string` and `suggestedFix?: string` already on the type.
- **Stub commands**: `pool.flip`, `pool.lock.ratio` registered in `categories/shape.ts` with `// CLIENT:` comments. `shape.rename` and `tool.activate` already existed.
- **Cache helpers**: `src/lib/cache/editor.ts` exports `loadCachedQuote`, `loadCachedValidation`, `writeCachedQuote`, `writeCachedValidation` as no-op stubs. Track F replaces.

## Stub command IDs (registered, not yet implemented)

| ID | Input | Client mutation contract |
|---|---|---|
| `pool.flip` | `{ id, axis: 'x' \| 'y' }` | Reflect shape geometry locally; Track A wires `useShapesStore` mutator. |
| `pool.lock.ratio` | `{ id, locked }` | Track A adds `useEditorStore.setRatioLock(id, locked)` and resize consumer. |
| `shape.rename` | `{ id, name }` | `useShapesStore.getState().renameShape(id, name)` already wired in `ClientCommandHandlers`. Track A consumes from `SelectionCard`. |

## Cache helper signatures

```ts
loadCachedQuote(projectId): Promise<CachedQuote | null>
loadCachedValidation(projectId): Promise<CachedValidation | null>
writeCachedQuote(projectId, summary: QuoteSummary): Promise<void>
writeCachedValidation(projectId, report: ValidationReport): Promise<void>
```

`CachedQuote = Quote & { lineItems: QuoteLineItem[] }`. Imports already resolve.

## Track ownership

### Track A — Inspector polish
- `src/components/editor/shell/RightPanel.tsx` (Specs/Quote tab bodies)
- `src/components/editor/shell/inspector/SpecsTab.tsx` (new)
- `src/components/editor/shell/inspector/QuoteTab.tsx` (new)
- `src/components/editor/shell/inspector/MaterialSection.tsx` (replace placeholder options with real `Material[]` prop)
- `src/components/editor/shell/inspector/PositionSection.tsx` (compute From-house/Setback)
- `src/components/editor/shell/inspector/GeometrySection.tsx` (Flip / Lock-Ratio buttons → `pool.flip`, `pool.lock.ratio`)
- `src/components/editor/shell/inspector/SelectionCard.tsx` (wire `shape.rename` on commit)
- `src/modules/measurements/engine.ts` (add `distanceToHouse`, `distanceToSetback` helpers)

### Track B — Validation rules
- `src/modules/validation/rules.ts` (emit `targetId`/`suggestedFix` per rule)
- `src/modules/validation/engine.ts` (pipe through)
- `src/modules/validation/types.ts` (only if new fields needed)

### Track C — Toolbar + palette polish
- `src/components/editor/shell/Toolbar.tsx` (Pool shape dropdown trigger)
- `src/components/editor/shell/PoolShapePicker.tsx` (new)
- `src/components/editor/shell/CommandPalette.tsx` (hide voice footer for v1; **coordinate with Track G** on empty-state copy — Track C makes structural edits, Track G refines copy if both edit, last writer wins on the empty-state block)
- `src/components/editor/three/ToolGestures.tsx` (real Annotation text input via `AnnotationDialog`)
- `src/components/editor/shell/AnnotationDialog.tsx` (new)

### Track D — Mode + View polish
- `src/components/editor/shell/ViewCube.tsx` (active state from `useCameraStore.targetView`)
- `src/modules/commands/categories/scene.ts` (`sun.run.study` real RAF animation)
- `src/modules/commands/categories/canvas.ts` (`camera.frame.selection` bbox-fit logic; the actual camera lerp lives in CameraRig)
- `src/components/editor/three/CameraRig.tsx` (frame-selection consumer)

### Track E — Materials registry
- `src/components/editor/three/Materials.ts` (add 12 missing materials: spa shell, sun-shelf surface, step concrete, bubbler chrome, LED housing, drain grate, spillover stone, deck concrete/pavers, house wall stucco, tree foliage/trunk, equipment-pad concrete, lounger wood)
- `src/components/editor/three/objects/{Spa,SunShelf,Steps,Bubblers,LedLights,Drains,Spillover,Deck,HouseWall,Trees,EquipmentPad,Loungers}.tsx` (replace inlined `useMemo` materials with imports from `Materials.ts`)

### Track F — Performance caching
- `src/app/(app)/projects/[id]/editor/page.tsx` (read from `loadCachedQuote`/`loadCachedValidation` first; fall back to engine recompute on miss)
- `src/components/editor/EditorPersistence.tsx` (call `writeCachedQuote` and `writeCachedValidation` after each debounced save commit)
- `src/lib/cache/editor.ts` (real implementation against `prisma.quote.upsert` and `prisma.validationResult.upsert`)

### Track G — Empty/error states + Electron smoke
- `src/components/editor/EditorPersistence.tsx` — **coordinate with Track F**: Track F writes the cache (around the existing save block); Track G adds a `toast.error` on persistence failure (a separate try/catch boundary). Make surgical edits on non-overlapping lines; Track G should run AFTER Track F to merge cleanly.
- `src/components/editor/shell/inspector/SelectionCard.tsx` — coordinate with Track A: Track A wires rename on the existing card; Track G adds a no-selection variant rendering project info (a separate render branch when `selectedId === undefined`).
- `src/components/editor/shell/CommandPalette.tsx` — see Track C note.
- `src/components/editor/shell/layers/LayersTree.tsx` (improve filtered-empty state when search returns no shapes)
- `electron/main.cjs` (Wave 0 already added AUTH_URL; Track G runs `pnpm electron:dev` smoke test and confirms login works end-to-end)

## Acceptance per track

- `pnpm typecheck` clean.
- `pnpm test` clean.
- No file modifications outside the owned list.
- No commits — parent agent commits after Wave 1 returns.

## Wave 1 → Wave 2 integration handoff

Wave 2 will:
1. Verify all imports across tracks resolve (cache helpers consumed by page + persistence; materials repointed; inspector tabs mounted).
2. Run `pnpm electron:dev` end-to-end.
3. Add Playwright e2e for new flows (rename, flip, palette + suggestion click).
4. Final `pnpm build` and bundle-size check.
