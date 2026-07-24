# Pool Forge — Path to World-Class

Assessment date: 2026-07-23. Based on a full read of the codebase, the running app, and current market research. Findings marked **[verified]** were confirmed directly against the code this session; the rest come from deep code reads and are high-confidence.

## Verdict (TL;DR)

Pool Forge has an **unusually strong architecture and a genuinely tidy 3D editor**, wrapped around a **design → price → proposal spine that is currently broken end to end**. The app *demos* like a product but *works* like a scaffold: several finished-looking surfaces are disconnected, synthetic, or stubbed.

The strategic trap to avoid: you've been building toward photoreal 3D as the differentiator. In this market **photoreal is table stakes, not a differentiator** — and worse, Pool Forge's best asset (the 3D scene) is never even embedded in the proposal it prints. The path to world-class is not "out-render Structure Studios." It's **make the integrated design→priced-proposal→e-sign→shareable-link loop actually work, on the web, with screen enclosures as the beachhead** — then lift rendering to table-stakes photoreal in parallel.

Sequence: **fix the spine → make the deliverable premium → lift the render.** In that order.

## What's genuinely strong (keep and build on)

- **Command-registry backbone.** Every action (button, hotkey, future voice) routes through one typed, Zod-validated, audited `execute()` path (`src/modules/commands/`, `src/app/api/commands/route.ts`, `ClientCommandHandlers.tsx`). This is the best part of the codebase and a real moat vs. the incumbents' legacy desktop CAD — it makes you voice-, macro-, and automation-ready without a rewrite. Rare and valuable.
- **Clean state + editor core.** Small focused Zustand stores (shapes/selection/history/camera/sun/view), undo/redo with drag-coalescing, and a competent hand-rolled perspective/ortho camera with eased transitions (`three/CustomOrbit.tsx`). Well factored.
- **The estimating pipeline is well-designed on paper.** canvas → measurements → pricing + validation → live quote → export, with versioned price books and replayable `Quote.snapshot`. The bones are right.
- **Modular 3D object layer** (one component per element, shared singleton materials) — trivial to extend, and a solid foundation to hang a real renderer on.
- **The screen-enclosure / site-plan WIP is aimed at the right wedge** (see Market section).

## What doesn't work (ranked by leverage)

1. **The design→price→proposal spine is broken.** **[verified]** The project form writes free-text string keys — `heaterSelection`, `lightingSelection`, `screenOption`, `sanitizationPackage`, `equipmentPackage`, `interiorFinish` (`ProjectForm.tsx:46-53`). The pricing engine, validation, editor, and every export read *different* boolean/number keys — `heaterSelected`, `saltSystemSelected`, `screenSelected`, `lightingQuantity` (`pricing/engine.ts`, `proposal/page.tsx:81-84`, `editor/page.tsx:102-105`) — that **nothing ever writes**. Result: equipment, lighting, and screen quote lines can never fire from user input; the proposal always prints "Not included." Two further key mismatches compound it: construction reads `pf.saltSelected` while others read `saltSystemSelected`; the form writes `sanitizationPackage` (with a z) while validation reads `sanitationPackage`. **One unification fix un-breaks the quote, validation, and proposal simultaneously — highest leverage in the whole codebase.**
2. **Material selection is a no-op.** `set.shape.material` / `pool.material.set` client handlers echo input and return ("No persistence yet", `ClientCommandHandlers.tsx:176-217`); the material picker shows `PLACEHOLDER_OPTIONS`; `PoolWalls` renders with no `materialId`. Choosing any pool finish, coping, or deck material changes nothing — not rendered, not persisted, not priced. For a design tool this is a core feature that appears to work and doesn't.
3. **Validation is largely theater — and a liability.** Always-pass safety pills print "GFCI on all pool circuits ✓" and "Equipment bonding per NEC 680.26 ✓" while checking nothing (`validation/rules.ts:325-361`). A fake rear-setback rule always warns instead of using the real `distanceToSetback()` that already exists (`measurements/engine.ts:98`). Required-field rules read keys the form never writes. On a contractor-facing construction packet, green safety checkmarks that verified nothing are real exposure, not just polish.
4. **Pricing engine is a first-pass stub.** **[verified]** `total === subtotal` always (`engine.ts:112`) — no tax, markup, discount, or commission. **[from deep read]** No formula evaluator exists despite the docs naming one (the `PriceBookItem.formula` column is dead); `required` items silently vanish (the seeded VS pump never appears in a quote); a SPA line mis-fires on any feature; deco-drain is billed at full perimeter; LANAI/WATER_FEATURE/FENCE/WALL/ELECTRICAL/MISC all return 0; screen is priced by deck area instead of cage surface. `pricing.test.ts` is entirely `it.todo`.
5. **The proposal doesn't embed the render, and isn't premium.** The plan view is flat colored `<rect>`s; **the 3D scene — the app's single best asset — is never rendered into any document.** No logo/brand color/cover page. "Export" is `window.print()` (browser headers, no server PDF, no stored artifact). No e-signature (blank pen-and-ink lines). No send/track, no proposal-accept state.
6. **Rendering has no photoreal subsystems at all.** Flat solid-color materials with zero texture maps, no IBL/HDRI, static plastic-looking water (no ripples/reflection/refraction/caustics), one directional shadow, no AO, no post-processing, no asset library. It's a clean *schematic massing* renderer — honestly tidy, but every photoreal subsystem is *absent*, not low-quality.
7. **Architecture drift and convention violations.** Docs say react-konva 2D; **there is no Konva — "2D" is the same three.js scene under an orthographic camera** (`three/CameraRig.tsx`). Project CRUD, price-book CRUD, and drawing saves all bypass the command registry and write no audit — directly contradicting the repo's own "command-registry-first / audit-every-action" rules. `build-priority.md` items 5–16 are all unchecked though the code exists.

## The UX awkwardness — root causes

You felt it was awkward; here's why, structurally:

- **The Move hotkey breaks dragging.** `V` sets tool `move`, but the drag handler only drags in `select` (`DragHandler.tsx:74`), so the documented Move shortcut leaves you able to select but not move.
- **No on-canvas resize/rotate/multi-select.** Resize/rotate exist only as inspector number fields; there's no gizmo/`TransformControls`. Shift is consumed by the camera for panning, so viewport multi-select is impossible; marquee is metadata-only.
- **Dead toggles.** Snap and Grid are wired to nothing and there's no grid to align to; precision = typing numbers.
- **Every click is a server round-trip.** Selecting a shape POSTs `/api/commands` and writes an audit row, and the highlight only applies after the fetch resolves — perceptible lag off-localhost, plus audit-log flooding from selection/camera noise.
- **Silent input drops.** The inspector sends `avgDepth`/`slope`; the handler ignores both, with no feedback.
- **Non-rectangle pools are fake.** The picker offers Roman/Grecian/Kidney; only rectangle has real geometry — the rest render as boxes (54 of 72 stencils render as an identical flat box).
- **Dead editor buttons.** Comments, Sun-study, Export, and the prominent **Share** CTA have no handler.
- **Desktop-only.** The editor hard-codes `min-w-[1024px]`; below that it overflows.

The through-line: **the app looks more finished than it is.** Closing the gap between apparent and actual function is most of the UX win.

## Rendering & the photoreal question (the strategic answer)

**Your instinct is half-right.** Near-photoreal 3D is what homeowners react to — but it's now *table stakes*, not an edge. Structure Studios (Pool Studio ~$147/seat/mo, Vip3D ~$197), which claims ~96% of pros, already ships path-traced water, day/night, and VR walkthroughs; a marketing-agency read of the market says renders above the ~$90K ticket "no longer provide a competitive advantage." So: **you must reach photoreal to be credible, but it won't beat them by itself.** (Those stats are vendor/agency claims — directionally true, not audited.)

**Don't hand-roll a photoreal engine in react-three-fiber as step one.** The pragmatic path is **hybrid: keep the interactive viewport, add a "Render this view" button**, and climb by ROI:

1. **HDRI / IBL environment** (drei `<Environment>` + sky). *Highest ROI, low risk* — instantly gives the existing physical water/glass/metal something to reflect and refract.
2. **PBR material sets** (water, pebble/plaster interior, travertine coping, glass mosaic, concrete/paver deck, stucco) at correct world scale.
3. **Real water shader** — animated flow-map normals, reflection/refraction, depth absorption, and projected caustics. The signature pool effect and the hardest real-time item.
4. **AO + soft shadows + post stack** (GTAO, SSR, subtle bloom, SMAA/TAA).
5. **"Render" button via `three-gpu-pathtracer`** — progressive path-traced stills that reuse the same scene graph; the Electron wrapper makes bundling a heavier local renderer viable.
6. **Asset library** (GLTF + KTX2/Draco + instanced vegetation/furniture/hardscape). This is the incumbents' true moat and the **long pole** — content and licensing dwarf the engine work; curate over time.

Real-time WebGL can reach convincing near-photoreal *stills/turntables*; it won't match offline path-traced GI/caustics at interactive framerates — hence the render-button hybrid. **And whatever you render, embed it in the proposal** — today the deliverable shows rectangles.

## Market position & the real wedge

The incumbent's soft underbelly is **architecture and workflow, not render quality**:

- Structure Studios is a **desktop Windows design tool**, per-seat, with client sharing via **exported videos + iPad AR** rather than a live browser link. It is a *design* tool — **not** estimating/CRM/proposal/financing/e-sign. Builders bolt on a *separate* stack (ProDBX, Poologics) + financing (Hearth). Two stacks, two bills.
- **The white space no one owns:** a **cloud/web-native, real-time** chain — design → live model-linked pricing → branded proposal + e-sign + financing → **shareable no-download 3D/AR link**. Your command-registry + live-quote architecture is already pointed straight at this.
- **Screen enclosures / pool cages (FL & Southeast)** are high-volume with *no dominant design software* — served by engineering firms and spreadsheets. A credible beachhead, and exactly what your WIP (`ScreenEnclosureQuoteDocument`, `SitePlanDocument`) is building toward. Lean in.
- **Shareable browser links** are a concrete, ownable gap: Twinmotion Cloud proves the pattern (link/QR/embed, browser + VR, reportedly free under $1M revenue) — a plausible "photoreal + shareable link" shortcut worth piloting.

Positioning in one line: **out-integrate them, don't out-render them** — cloud-native design-to-signed-proposal, starting with Florida screen enclosures.

## Prioritized path to world-class

**P0 — Make the spine real (days). Highest leverage, lowest effort.**
- Unify `poolFields` on one typed (Zod) schema with **one** writer; replace the free-text form inputs with real controls (heater on/off, salt on/off, screen on/off, lighting qty, interior finish) writing the **same keys the engine reads**. Fix the `saltSelected`/`saltSystemSelected` and `sanitizationPackage`/`sanitationPackage` mismatches. *This one change un-breaks quote + validation + proposal.*
- Persist and render material selection (stop the no-op).
- Fix pricing correctness: enforce `required`, kill the SPA-on-any-feature and deco-drain=perimeter bugs, add tax/markup, wire the dead categories or hide them.
- Either implement the safety/setback validation against real geometry (the helpers exist) or remove the always-pass code pills — don't ship checkmarks that verified nothing.
- Wire or remove the dead editor buttons (Export/Share/Comments/Sun-study).

**P1 — Make the deliverable premium (the thing that wins deals).**
- Embed a 3D render (offscreen snapshot) into the proposal; add logo/brand color/cover.
- Real headless PDF + a persisted `Export` artifact.
- Shareable no-download client link (design + proposal in browser) + e-sign + Hearth-style monthly-payment/financing. This *is* the integrated-chain wedge.

**P2 — Lift rendering to table-stakes photoreal (parallel).**
- HDRI/IBL → PBR materials → water shader + caustics → AO/post → `three-gpu-pathtracer` "render" button → asset library (long pole).

**P3 — Foundations for scale.**
- A unified input manager (single raycast + tool state machine) before building resize/rotate/marquee/snap on today's fragile four-listener base.
- A client-only fast path for ephemeral actions (select/camera) with batched audit — stop round-tripping and flooding `CommandAuditLog` on every click.
- Real snapping/grid; non-rectangle pool geometry; cloud DB + web deploy; tests on the pricing engine (all `it.todo`) and 3D interaction (near-zero).

## Appendix — concrete defects to fix (file:line)

- `ProjectForm.tsx:46-53` writes `heaterSelection`/`lightingSelection`/`screenOption`/`sanitizationPackage`/`equipmentPackage`/`interiorFinish`; readers want `heaterSelected`/`screenSelected`/`saltSystemSelected`/`lightingQuantity` — **no overlap.** [verified]
- `construction/page.tsx:78` reads `pf.saltSelected`; others read `saltSystemSelected`. [verified]
- `pricing/engine.ts:112` `total = subtotal` (no tax/markup); `:106` filters `quantity>0` so `required` items vanish; SPA keys off `featureCount>0`; LANAI/WATER_FEATURE/FENCE/WALL/ELECTRICAL/MISC return 0. [verified total; deep-read rest]
- `measurements/engine.ts:148-149` `copingLinearFeet === decoDrainLinearFeet === perimeter` (deco drain over-billed).
- `ClientCommandHandlers.tsx:176-217` material set is a no-op; `:193-208` `pool.geometry.update` ignores `avgDepth`/`slope`.
- `validation/rules.ts:159-177` fake always-warn setback; `:325-361` always-pass safety/code pills.
- `hotkeys/index.ts:18` + `DragHandler.tsx:74` — Move hotkey (`V`) disables dragging.
- `editor/page.tsx` reads a cached quote while exports recompute fresh — totals can diverge; `lib/cache/editor.ts:61,66` hardcodes `category:'POOL'` and corrupts inspector grouping.
- `HeaderBar.tsx:65-95` dead Comments/Sun-study/Export/Share buttons.
- `EditorLayout.tsx:73` `min-w-[1024px]` (desktop-only editor).
- `site-plan/page.tsx:40` `surveyImageUrl` hardcoded `null` (the survey underlay — the point of a permit site plan — never shows).
</content>
