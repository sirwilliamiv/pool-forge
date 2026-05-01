# Pool Forge — Editor Demo Guide

**Login:** `demo@poolforge.test` / `demo1234`
**Direct URL:** `/projects/seed-project-demo/editor`

The editor covers the full viewport. To leave, browser-back to the dashboard.

---

## The screen

```
┌─────────────────────────────────────────────────────────────┐
│  PF · breadcrumb · auto-saved 2m ago        avatar   Share  │  44px header
├──────────┬───────────────────────────────────┬──────────────┤
│ Layers   │  [Plan|Design|Build|Customer]     │  Design tab  │
│ Stencils │                                   │  Selection   │
│ Materials│         3D scene                  │  Position    │
│  search  │                                   │  Geometry    │
│   ┊      │  Sun ☀                  Quote $  │  Material    │
│ shape    │                                   │  Computed    │
│  rows    │                         ViewCube  │  Quote       │
│   ┊      │  Toolbar           Validation 0/4 │              │
│Plan|3D|… │                                   │              │
└──────────┴───────────────────────────────────┴──────────────┘
   248px           1fr                              296px
```

- **Header** — breadcrumb, save status, avatar, Share
- **Left** — three tabs: Layers / Stencils / Materials. Bottom: view-mode pill.
- **Center** — 3D canvas with floating chrome
- **Right** — Inspector. Three tabs: Design / Specs / Quote.

---

## 5-minute demo script

The seeded project has a 60'×30' rectangle pool with deck, spa, sun shelf, and site context (house, trees, equipment pad, loungers).

### 1. Orbit the scene (10s)
- **Left-drag** — orbit
- **Shift-drag** or right-drag — pan target
- **Scroll** — zoom

### 2. Select and move (20s)
- **Click the pool** → blue selection halo appears + DOM label "Rectangle pool" + dark contextual toolbar above it (duplicate / swap-material / lock / hide / delete).
- **Drag the pool** while still selected → it follows the ground plane. Release to commit (one audit row).
- **Click empty ground** → selection clears.

### 3. Edit via inspector (45s)
- Select the pool again.
- Right panel shows **Design** tab:
  - **Position** — X / Y / Rotation. Type `30` in X, **Tab** out → pool jumps to that x.
  - **Geometry** — L/W/D̄, Sh/Dp/Sl. Type `80` in L, **Enter** → pool grows to 80 ft long. The Computed metrics (surface area, perimeter, gallons, wetted area) update.
  - **Material** — three rows (Interior / Coping / Tile band). Click a row → dropdown of real seeded materials → pick one.

### 4. Add a stencil (15s)
- Left panel → **Stencils** tab → search "step" → click a "Corner steps" card → 3D steps appear next to the pool, layers tree gets a new row.
- Bottom toolbar Pool button has a **chevron** → click → choose Roman / Grecian / Kidney → next click on the canvas drops that pool variant.

### 5. Layers panel (15s)
- Left panel → **Layers** tab.
- Click any layer row → corresponding 3D shape gets the halo.
- Hover a row → eye icon appears → click → shape disappears from the canvas. Click again to show.
- Padlock icon → toggles lock (locked shapes can't be dragged).

### 6. Materials panel (20s)
- Left panel → **Materials** tab.
- With the pool selected, click any swatch → material applied to the pool's interior slot, toast confirms.
- With nothing selected, click a swatch → arms the **Material brush**. Then press **B** + click a shape on canvas → applies.

### 7. Sun study (15s)
- Bottom-left **Sun Study** card — drag the slider from sunrise to sunset. Lighting + shadows track the sun in real time. Release commits one audit row.
- Or run **"Run sun study"** from ⌘K → the sun animates across the day automatically over 8 seconds.

### 8. View cube (10s)
- Right side **ViewCube** card — click TOP / FRONT / LEFT / RIGHT / ISO faces → camera tweens to that pose over 300ms. The active face highlights.

### 9. Presentation modes (30s)
Top-center pill — four modes share the same scene with different presentation:
- **Plan** — top-down ortho camera, setback envelope (amber wireframe), dimension labels. No trees/house.
- **Design** — the working view (default). Rich 3D + selection chrome.
- **Build** — adds rebar dots on the floor + yellow gas-line route + construction labels.
- **Customer** — softer light, no construction symbols, no validation glows. What the homeowner sees.

### 10. Validation dock (15s)
- Bottom-right pill: red `2` / amber `4` / green `8`.
- Click the chevron → expand to a list of issues with proposed fixes.
- Click any issue row → 3D selection jumps to the affected shape (the seeded validations now emit `targetId`).

### 11. Live quote dock (15s)
- Top-right card — running total + delta chip (e.g., `+$1,820` after a change).
- Click the header to expand → category breakdown (Pool shell, Spa, Equipment, Deck, Lighting), subtotal, permits, **Generate proposal** button.

### 12. Inspector tabs (20s)
Right panel header has three tabs:
- **Design** — what we used above.
- **Specs** — construction-grade defaults: wall 8", rebar #4 @ 18" OC, 4000 PSI, gas 3/4", 240V. Read-only for v1.
- **Quote** — full per-line-item table grouped by category. Selected shape's lines are highlighted.

### 13. Command palette (15s)
- **⌘K** (Mac) / **Ctrl+K** (Win) → modal opens.
- **Suggested** group at the top: pulled from the project's open validation issues + rotating hints.
- **Add** group: stencils to drop. Click → adds shape, persists.
- **Actions** group: registered commands.
- ↑↓ to navigate, ⏎ to run, **Esc** to close.

### 14. Frame selection (5s)
- Click any shape, press **F** → camera tweens to frame it.

---

## Keyboard shortcuts

| Action | Key |
|---|---|
| Move tool | **V** |
| Pool shape (with chevron for variants) | **R** |
| Steps | **S** |
| Water feature | **W** |
| Lights | **L** |
| Deck | **D** |
| Material brush | **B** |
| Measure (click two points → distance label) | **M** |
| Annotation (click → text dialog) | **T** |
| Comment (placeholder) | **C** |
| Frame selection | **F** |
| Pan | **Space + drag** |
| Command palette | **⌘K / Ctrl+K** |
| Undo / Redo | **⌘Z / ⌘⇧Z** |
| Duplicate selected | **⌘D** |
| View mode | **1 / 2 / 3** (Plan / 3D / Section) |
| Deselect / close modal | **Esc** |
| Export proposal / construction | **⌘E / ⌘⇧E** |

---

## Troubleshooting the demo

**Editor shows "Internal Server Error" right after login.**
The seed may not have run. From the project root: `pnpm db:seed`.

**Geometry edits don't appear to render.**
Click into the input, change the number, press **Enter** or **Tab** (don't just click away mid-keystroke). The 3D scene rebuilds geometry on each commit. If it still doesn't update, the audit log will show whether the dispatch went through — `select * from "CommandAuditLog" order by "ranAt" desc limit 5;`.

**Toolbar or panels disappear.**
The editor uses `fixed inset-0` to cover the viewport — there shouldn't be any window-level scroll. If the layout breaks, your viewport is below 1024px wide; resize.

**Drag doesn't work.**
Drag only works on **selected** shapes with the **Move tool active** (V). It also fails on locked shapes (padlock in the layers panel or contextual toolbar).

**Material clicks don't apply.**
You need a shape selected first. With nothing selected, clicking a material **arms the brush** — press B, then click a shape.

**Plan mode looks empty.**
Trees, house, loungers, and equipment pad are intentionally hidden in Plan and Customer modes. Switch back to Design.

---

## What's deferred (not on the demo path)

- Real multiplayer cursors (header avatar is single-user)
- In-canvas resize handles (use the inspector for now)
- Real comment threads
- Voice dictation footer in ⌘K (rendered dormant)

Everything in the script above is real and audit-logged.

---

## Tech notes

- Stack: Next.js 15 + React Three Fiber 9 + Zustand + Prisma + PostgreSQL.
- Scene: ~60 procedural meshes. 1 unit = 1 foot.
- Persistence: 800ms debounced save of the full Drawing tree as JSON. Quote and ValidationResult are write-through cached so editor mount is fast.
- Every UI mutation routes through `/api/commands` and writes a `CommandAuditLog` row.
- Web build: `pnpm dev` (port 3000 default).
- Electron: `pnpm electron:dev` for desktop. AUTH_URL is set automatically in `electron/main.cjs`.
