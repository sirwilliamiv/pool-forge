# Build priority

Mirrors product brief §17. Order matters — earlier items establish foundations the later ones rely on.

- [x] **1. Auth and organization model** — User, Organization, OrganizationMember; credentials provider; org auto-create on register.
- [x] **2. Project model** — Project / Customer / Drawing schema with org scoping.
- [x] **3. Canvas editor shell** — `EditorShell.tsx` layout (left toolbar, stencil panel, center canvas, right properties, top toolbar, bottom status, slide-in quote).
- [x] **4. Shape library** — full stencil catalog (pool shapes, interior features, deck/house, construction symbols, water/outdoor).
- [x] **5. Rectangle pool drawing** — rendered in the R3F scene with select/drag; resize/rotate are inspector fields, not on-canvas handles.
- [x] **6. Deck drawing** — concrete / paver / grass decks render and measure. Overlap against the pool footprint is not enforced.
- [x] **7. Measurement engine** — area, perimeter, gallons, deck area, coping LF, feature counts; recomputed on every shape change.
- [ ] **8. Resize by target area** — `set.pool.targetArea` is registered but its `execute` is still a stub.
- [x] **9. Price book schema + CRUD UI + XLSX import.** No formula evaluator yet — `PriceBookItem.formula` is still dead.
- [x] **10. Quote panel** — live line items from measurements + price book, with org sales tax.
- [x] **11. Validation engine** — 12 real rules, pass / warn / error, click-to-jump target ids.
- [x] **12. Proposal export** — HTML document + browser print. No server-side PDF, no stored artifact file.
- [x] **13. Construction export** — 11×17 (Letter opt-in), dense measurements. Plus site plan and screen-enclosure RFQ.
- [x] **14. Excel price book import** — XLSX upload, column mapping, preview, version save.
- [x] **15. Command registry** — foundation plus real `execute()` bodies for the export category; most other categories are still stubs whose work happens in client handlers.
- [x] **16. Tool documentation panel** — `/docs/tools` and `/docs/commands` render the catalogs.

Known gaps that no item above covers: `HOTKEYS` is never bound to a listener,
material selection doesn't persist or render, and project / price-book / drawing
writes still bypass the command registry.

## Deferred (post-MVP)

- Survey image overlay + scale calibration
- Voice agent (the command registry is voice-ready; speech recognition layer not yet)
- Google OAuth (provider scaffolded but disabled)
- Electron desktop packaging
- Vercel deployment
- Neon Postgres swap (local-first for now)
