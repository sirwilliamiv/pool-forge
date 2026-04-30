# Pool Forge — Editor Quickstart

Login: `demo@poolforge.test` / `demo1234`. Open the seeded project from the dashboard. The editor opens at `/projects/seed-project-demo/editor`.

---

## The screen at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  PF  · Pool Forge / Customer / Backyard Pool · auto-saved   │  ← Header
├──────────┬───────────────────────────────────┬──────────────┤
│ Layers   │  [Plan][Design][Build][Customer]  │  Design tab  │
│ Stencils │                                   │  Selection   │
│ Materials│         3D scene                  │  Position    │
│          │                                   │  Geometry    │
│          │  Sun ☀                Tools ⚙     │  Material    │
│          │                       Quote $     │  Computed    │
│ Plan|3D|Section                  Validation  │  Quote       │
└──────────┴───────────────────────────────────┴──────────────┘
```

- **Header** — breadcrumb, auto-save status, your avatar, share button
- **Left panel** — 3 tabs: **Layers** (everything in this design), **Stencils** (drag-on shapes), **Materials** (finishes you can apply)
- **Center** — the 3D canvas + floating chrome
- **Right panel** — the **Inspector**: details about whatever's selected
- **Bottom-left of left panel** — view mode (Plan top-down / 3D / Section)

---

## 90-second demo path

1. **Look around the pool.** Drag = orbit. Shift-drag = pan. Scroll = zoom.
2. **Click the pool.** A blue halo appears. The right panel fills in with Position / Geometry / Material / Computed metrics / Quote contribution.
3. **Edit the geometry.** In the right panel under "Geometry," change `L` from 30 to 36 and press **Enter**. The pool grows. Costs update.
4. **Drag the sun.** Bottom-left card "Sun Study" — drag the slider. Lighting moves in real time. Release commits one audit row.
5. **Snap the camera.** Right side has a small ViewCube card with TOP / FRONT / LEFT / RIGHT / ISO buttons. Click each.
6. **Switch presentation modes.** Top-center pill: Plan / Design / Build / Customer.
   - **Plan**: top-down, dimension labels, setback envelope, no trees.
   - **Design**: rich 3D — the default working view.
   - **Build**: rebar dots on the floor, gas-line route, construction labels.
   - **Customer**: softer light, no construction symbols, no validation glows — what the homeowner sees.
7. **Open the command palette.** Press **⌘K** (Mac) or **Ctrl+K**. Type to filter. ↑↓ to navigate. ⏎ to run. Esc to close. The "Suggested" group reads from the project's open validation issues.

---

## Left panel — three tabs

### Layers
Lists every shape in the design. Each row:
- **Click name** → selects on canvas
- **Eye icon** (hover or selected) → hide/show
- **Padlock** → lock/unlock so it can't be dragged

Selecting a shape on the canvas highlights its row, and vice versa.

### Stencils
70+ presets across categories (Pool shells, Steps & shelves, Water features, Lighting, Site & deck, Construction symbols).
- **Search** the box at the top filters across all categories
- **Click a card** → drops a new shape into the design at canvas center

### Materials
Swatches grouped by kind (Interior finishes / Coping / Tile / Decking).
- **Click a swatch with a shape selected** → applies that material to the shape
- **Click a swatch with nothing selected** → arms the **material brush**. Then choose the brush tool (B) from the bottom toolbar and click any shape to apply.

---

## Bottom toolbar (in order, with shortcuts)

| Button | Key | What it does |
|---|---|---|
| Move | **V** | Default. Click-to-select, drag-to-move (drag is currently inspector-only — Phase 3). |
| Pool shape | **R** | Next click on the canvas drops a rectangle pool there. |
| Steps | **S** | Next click drops corner steps. |
| Water feature | **W** | Next click drops a waterfall. |
| Lights | **L** | Next click drops an LED light. |
| Deck | **D** | Next click drops a concrete deck. |
| Material brush | **B** | Next click on a shape applies the active brush material. |
| Measure | **M** | Click two points → floating distance label appears. **Esc** clears. |
| Annotation | **T** | Drops a placeholder marker. (Real text input is Phase 3.) |
| Comment | **C** | Placeholder — comments aren't wired yet. |
| Sparkle | — | Opens the ⌘K command palette. |

After dropping a shape with R/S/W/L/D, the tool resets back to Move.

---

## Right panel — the Inspector

Three tabs at the top: **Design** (geometry & materials), **Specs** (construction details — coming), **Quote** (full per-line-item).

When something is selected, the Design tab shows:

- **Selection card** — what you've selected. Editable name.
- **Position** — X, Y, Rotation. Type a value, press **Enter** or **Tab** to commit. The 3D scene updates.
- **Geometry** — Length / Width / Avg depth, then Shallow / Deep / Slope.
- **Interior finish / Coping / Tile band** — current material, swap from a dropdown.
- **Computed** — surface area, perimeter, volume, wetted area. Live.
- **Contribution to quote** — what this element costs the project, with breakdown.

When **nothing** is selected, the inspector shows project-level info (the demo defers this — for now you'll just see the empty placeholder).

---

## Floating chrome (over the canvas)

- **Top-center mode pill** — Plan / Design / Build / Customer
- **Top-right Live Quote dock** — running total + delta. Click the header to expand and see line items by category. Generate Proposal button at the bottom.
- **Right ViewCube** — TOP / FRONT / LEFT / RIGHT / ISO snap buttons (300ms ease)
- **Bottom-left Sun Study** — drag to scrub the day. Lighting follows in real time.
- **Bottom-right Validation dock** — errors/warnings/ok pills. Click a row → selection jumps to the affected layer.

---

## Keyboard shortcuts

| Action | Key |
|---|---|
| Tools | **V R S W L D B M T C** |
| Frame selection | **F** |
| Pan canvas | **Space + drag** |
| Command palette | **⌘K / Ctrl+K** |
| Undo / Redo | **⌘Z / ⌘⇧Z** |
| Duplicate selected | **⌘D** |
| View mode tabs | **1 / 2 / 3** (Plan / 3D / Section) |
| Deselect / close modal | **Esc** |
| Export proposal / construction | **⌘E / ⌘⇧E** |

Help: `⌘/` lists everything (coming).

---

## What's intentionally not wired yet

The v1 cut deferred:
- Multiplayer cursors (header avatar is single-user)
- In-canvas drag/resize handles (use the inspector)
- Comment threads (Comment tool drops a placeholder)
- Real annotation text input (Annotation tool drops a marker)
- The Specs and Quote inspector tabs (Design tab is the working one)
- ⌘K voice dictation (the footer affordance is shown but inactive)

Everything else listed above is real and audited via `CommandAuditLog`.
