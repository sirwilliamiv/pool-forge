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

## Wave I — image ingestion (in progress, jumped the queue)

Spec: `superpowers/specs/2026-08-19-image-ingestion-design.md`. Customer photos,
AI concept renders, and dimensioned graph-paper sketches translated into measured
projects. Supersedes the deferred "survey image overlay" item below, which was a
strict subset of it.

Per `docs/competitive-analysis.md:85`, AI is uncontested across all 21 competitors
surveyed: "Photo→design, AI estimating, auto-camera all uncontested."

- [x] **I0 contract** — ingestion models + migration, `BlobStore`, `POLYGON_POOL`
      primitive, `import` command category, survey data-URL migration.
- [ ] **I1 ingest** · **I2 extraction** · **I3 precision** · **I4 review wizard** ·
      **I5 intake funnel** — parallel tracks over disjoint file sets.
- [ ] **I6 integration** — end-to-end money path plus the golden-corpus eval harness.

Note: I0 took ownership of the freeform polygon footprint that Wave 1 T2 was
slated to author. T2 is now a consumer of it; its plan is amended accordingly.

## Marketing: Dream Pool Studio (net-new, not from the brief)

Spec: `superpowers/specs/2026-08-29-dream-pool-studio-design.md`. A public,
no-login pool configurator for **homeowners** at `/dream`, running on the real
measurement and pricing engines against a reference rate list of its own. Its
job is reach and one completed lead, not retention: a homeowner buys a pool
once.

This is the first item here that is not from product brief §17. It was added
deliberately rather than pulled forward, and it is the only user-facing surface
that shows money to somebody who is not a customer, which is why
`REFERENCE_PRICE_NOTICE` and the honest range in `modules/dream/spread.ts` are
load-bearing rather than decorative.

- [x] **M1 studio** — parametric config, measurement bridge, reference pricing,
      ballpark spread, nudges, share codec, the plan drawing, the lead endpoint
      and `DreamDesign`.
- [ ] **M2 delivery** — actually emailing the design to the address collected.
      There is no mail provider yet (`docs/beta-operations.md`), so the endpoint
      records the lead and the page promises an email nobody sends. Wire this
      before the page is linked from anywhere public.
- [ ] **M3 routing** — handing a lead to a builder, and the `routedAt` column
      that is already on the model waiting for it.
- [ ] **M4 embed** — the same engine as a widget on a builder's own site, priced
      from their price book. The paid version of this feature.

## Deferred (post-MVP)

- ~~Survey image overlay + scale calibration~~ (absorbed into Wave I above)
- Voice agent (the command registry is voice-ready; speech recognition layer not yet)
- Google OAuth (provider scaffolded but disabled)
- Electron desktop packaging
- Vercel deployment
- Neon Postgres swap (local-first for now)
