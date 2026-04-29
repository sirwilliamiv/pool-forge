# Build priority

Mirrors product brief §17. Order matters — earlier items establish foundations the later ones rely on.

- [x] **1. Auth and organization model** — User, Organization, OrganizationMember; credentials provider; org auto-create on register.
- [x] **2. Project model** — Project / Customer / Drawing schema with org scoping.
- [x] **3. Canvas editor shell** — `EditorShell.tsx` layout (left toolbar, stencil panel, center canvas, right properties, top toolbar, bottom status, slide-in quote).
- [x] **4. Shape library** — full stencil catalog (pool shapes, interior features, deck/house, construction symbols, water/outdoor).
- [ ] **5. Rectangle pool drawing** — first real Konva-rendered shape with select/drag/resize/rotate handles.
- [ ] **6. Deck drawing** — concrete + paver materials, deck attaches to pool footprint without overlap.
- [ ] **7. Measurement engine** — area, perimeter, gallons, deck area, coping linear feet, feature counts; recalculation on every shape change.
- [ ] **8. Resize by target area** — input target sq ft → scale shape proportionally → update all derived measurements.
- [ ] **9. Price book schema** — done (data model is in place); build CRUD UI + formula evaluator next.
- [ ] **10. Quote panel** — live line items grouped by section, sourced from measurements + price book formulas.
- [ ] **11. Validation engine** — pass / warn / blocking-error states with click-to-jump.
- [ ] **12. Proposal export** — HTML template → PDF, customer-facing.
- [ ] **13. Construction export** — HTML template → PDF, contractor-facing with dense measurements.
- [ ] **14. Excel price book import** — XLSX upload, column mapping, preview, version save.
- [ ] **15. Command registry** — done as foundation in Phase 1 (stub commands registered); fill in real `execute()` bodies as features land.
- [ ] **16. Tool documentation panel** — render `src/modules/editor/tools/index.ts` as an in-app help drawer.

## Deferred (post-MVP)

- Survey image overlay + scale calibration
- Voice agent (the command registry is voice-ready; speech recognition layer not yet)
- Google OAuth (provider scaffolded but disabled)
- Electron desktop packaging
- Vercel deployment
- Neon Postgres swap (local-first for now)
