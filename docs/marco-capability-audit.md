# Marco: capability audit and per-page design

Status, 2026-08-30. Audit of what the voice assistant can actually do today, why
pointing at things is unreliable, and the design for what he should be able to
do on every authenticated page. The implementation plan lives at
`docs/superpowers/plans/2026-08-30-marco-per-page-capabilities.md`.

---

## 1. How Marco works today

- Mounted once in the app shell (`src/app/(app)/layout.tsx:33`) for any signed-in
  user, so a session survives client-side navigation.
- Session runs on Gemini Live (`gemini-live-2.5-flash-native-audio`, Vertex AI)
  in the Electron main process or the `services/voice-relay` service. The relay
  IS deployed: `deploy.sh:203-249` deploys `pool-forge-voice-relay` to Cloud
  Run when the ticket secret exists and bakes the derived `wss://` URL into the
  app build. Verified live in `pool-forge-prod` on 2026-08-30. Note
  `docs/guide-agent-plan.md:149-153` claims otherwise and is stale, and the
  URL never appears in `.env*` files because it exists only inside the
  production build.
- Tools are generated from the command registry (`src/modules/voice/tools.ts`).
  A command becomes a voice tool only if: its category is in the current
  screen's scope (`src/modules/voice/scope.ts:38-49`), it has `voiceExamples`,
  it is not `unimplemented`, and its Zod schema survives the JSON Schema
  converter (no unions, depth 4 max).
- Every tool call re-dispatches through `/api/commands` with `source: 'VOICE'`,
  so scope, Zod, org scoping and the audit log all apply.
- Page awareness is three facts: the screen enum, the project id, the project
  name (scraped from the DOM 300 ms after mount). No page content reaches the
  prompt; Marco must pull it with `page.read` or `guide.list`.

### Tool counts per screen today

| Screen | Tools | Beyond the 10 globals |
|---|---|---|
| dashboard | ~12 | `create.project`, `project.proposal.accept` |
| project | ~16 | + 4 exports |
| editor | ~66 | canvas, shape, measurement, pricing, validation, scene, template, grade, site |
| import | ~20 | 10 import commands |
| priceBook | ~15 | 4 pricing + `settings.voice.set` |
| settings | ~16 | `settings.voice.set` + 5 scene templates |
| document | ~16 | exports + project |

Globals everywhere: `nav.goto`, `nav.openProject`, `nav.focus`, `palette.open`,
`page.read`, `page.fill`, `page.click`, `guide.point`, `guide.clear`,
`guide.list`.

---

## 2. Why highlighting is unreliable (the actual complaint)

All of these are confirmed in code, with locations.

1. **Never scrolls the target into view.** No `scrollIntoView` anywhere in the
   guide. A target below the fold gets a ring drawn off-screen and Marco
   reports success. The original design (`docs/guide-agent-plan.md:126`)
   specified it; it was not built.
2. **No occlusion test.** `isVisible` (`src/modules/guide/resolve.ts:82-88`)
   checks box size and CSS only. The editor is `fixed inset-0 z-40` and covers
   the TopNav, whose links still have real boxes, so on the editor screen
   `guide.list` reports nav links as present and `guide.point` rings blank
   space over the canvas. The e2e test passes because of this bug
   (`src/test/e2e/marco.spec.ts:53-63` finds a TopNav ring on a page with zero
   targets of its own).
3. **Rings never clear.** Not on navigation, not on the next utterance, not on
   click. The guide store has no pathname effect; rings survive route changes
   until the 400 ms poll fails to resolve them, and TopNav-anchored rings
   persist forever.
4. **Only 2 of 7 screens have targets.** 21 editor + 4 dashboard entries in
   `src/modules/guide/targets.ts`. Project page, price book, all settings
   pages, import, and documents have zero page-specific pointable targets.
5. **Collapsed panels are dead ends.** Contents of a non-active LeftPanel tab
   are unmounted, and there is no reveal step (`guide.reveal` was designed,
   never built). Marco can ring the Stencils tab but cannot open it to show
   what is inside.
6. **`view.cube` can never resolve.** Its accessible name lives on a
   `div[role="group"]` (`ViewCube.tsx:64-67`), which is not in the candidate
   selector (`resolve.ts:51-53`). Permanently reported as missing.
7. **First match wins with no disambiguation.** "Materials" appears in four
   components, "Layers" in five. Whichever is earliest in document order gets
   the ring.
8. **The guide disappears entirely when voice is unavailable.**
   `VoiceDock.tsx:192` early-returns before rendering `GuideHighlight` and
   `MarcoActions`, so the model-free tour (designed to work with the mic off)
   vanishes exactly when the relay is unconfigured, which is production today.
9. **Tour timer does not reset on re-click**, so a second "Explain this page"
   clears 9 s after the first click (`MarcoActions.tsx:39-46`).
10. **Ring layer re-renders 2.5x per second** even when nothing moved:
    `measure()` sets fresh `DOMRect`s unconditionally on a 400 ms interval over
    a WebGL canvas (`GuideHighlight.tsx:56,66`).
11. **z-order conflicts.** The ring layer is `z-[60]`, above every Radix
    overlay (`z-50`) but below CommandPalette and DestructiveConfirm
    (`z-[100]`): rings draw on top of open modals while pointing at controls
    the modal covers.

---

## 3. Structural gaps beyond highlighting

- **11 voice-ready tools are unreachable.** Categories `sketch` (6 tools,
  including `grid.set`), `version` (4), and `capture.coverage.describe` have
  voiceExamples and working handlers but appear in no screen's scope
  (`scope.ts:38-49`). `guide.point` will ring the grid-size control while
  `grid.set` is uncallable.
- **Intake commands are scoped to the wrong page.** `import.intake.link.*`
  carry category `import`, scoped to `/projects/[id]/import`; the intake links
  UI lives at `/settings/intake`, which maps to `settings`. "Show me my
  customer upload links" can never be answered from the page that shows them.
- **The settings category publishes zero tools**, so the `settings` and
  `priceBook` screens gain nothing from it. `settings.company.update` exists
  and works but has no voiceExamples; `add.priceBookItem` is a stub.
- **The destructive gate protects dead ids.** `tools.ts:285-292` gates
  `project.delete` and `archive.project`, neither of which is a registered
  command. The real delete/archive/duplicate/status paths are direct server
  actions (`src/modules/projects/actions.ts`), invisible to Marco and to the
  audit log.
- **Registry bypasses (CLAUDE.md violations Marco inherits).** Price book CRUD
  and XLSX import (`settings/price-book/actions.ts`, a destructive bulk
  replace with no audit row), project delete/archive/duplicate/status, the
  ~28-field project form autosave, share/unshare, and the editor toolbar's
  direct store write (clicking a tool is unaudited; pressing its hotkey is
  audited).
- **`update.projectLineItem` is voice-exposed but has no UI caller**, and the
  quote Marco reads (`generate.quote`) and the quote on screen (client-side
  `LiveQuote`) come from two different code paths.
- **Comments are entirely voiceless.** No voiceExamples, no scope. Marco cannot
  leave, read, or resolve a drawing note.
- **Eval blind spot.** Zero eval cases exercise `guide.*`, and the harness
  (`src/modules/voice/eval/run.ts:865`) has no branch for guide ids, so a
  guide eval would grade the harness, not the model.
- **`/docs/commands` hides 12 of 22 categories** (`CommandList.tsx:8-19`
  hardcodes 10).

---

## 4. Per-page capability design

Format per page: **Explain** (pointable targets + spoken explanation),
**Answer** (questions Marco can answer from real data), **Do** (commands).
"NEW" marks work in the plan; everything else exists today.

Principles carried through every page:

- Registry-first: every new "Do" is a registered command with Zod in and out,
  audit row, org scoping. No new server-action bypasses; existing bypasses that
  Marco needs get commands.
- Destructive actions stay behind the two-pass confirm plus the client modal.
- Reads are cheap and safe: every screen gets a `*.describe`-style read-back so
  Marco answers from data, not guesses.
- Pointing only at DOM chrome, never the WebGL canvas.
- Flat tool schemas (the Live API converter refuses unions and depth > 4).

### 4.1 `/dashboard`

- **Explain** (NEW targets): New project, status filter pills, per-card status
  dropdown, card menu (Open editor / Duplicate / Archive / Delete), first-run
  checklist, nav links (Price book, Customer uploads, Company, Team, Docs).
- **Answer** (NEW `project.list.describe`): how many projects, by status, most
  recently touched, which proposals were accepted and by whom, what setup steps
  remain.
- **Do**: `create.project` (today), `nav.*` (today); NEW `project.status.set`,
  `project.duplicate`, `project.archive` (destructive), `project.delete`
  (destructive), `settings.firstRun.dismiss` (add voiceExamples).

### 4.2 `/projects/[id]` (project overview)

- **Explain** (NEW targets): Open editor, Import from image, the four document
  buttons, share card (Create link / Copy / Revoke), versions rack, Save
  current drawing, line items Add, the customer/details form regions.
- **Answer** (NEW `project.describe`): status, customer contact, derived depth,
  line-item subtotal, share state and acceptance, saved versions with totals,
  jurisdiction/parcel, proposal expiry.
- **Do**: exports, `project.proposal.accept`, `add/update/remove.projectLineItem`
  (move `pricing` into project scope); NEW `project.share.create`,
  `project.share.revoke` (destructive), `project.update` (the form fields, one
  flat command replacing nothing but giving voice a path),
  `project.status.set`, `project.duplicate`, `project.archive`,
  `project.delete`; `version.save/open/rename/delete` (add `version` to scope).

### 4.3 `/projects/[id]/editor`

Already the deepest surface (~66 tools). Additions:

- **Explain** (NEW targets): Section view, Deck, Steps and shelves, Water
  feature, Lights, Annotation, Site panel, Sheets, Quote dock, Validation
  checklist, Notes, Scene templates, Redo, sun dial, presentation mode pills,
  right-panel tabs (Design / Specs / Quote). Fix View cube. NEW `guide.reveal`
  opens a panel tab before pointing inside it.
- **Answer**: `scene.describe`, `grade.describe`, `site.describe`,
  `calculate.measurements`, `generate.quote`, `run.validation` (all today);
  NEW `validation.describe` (spoken list of failures with suggested fixes,
  jump-to-shape), NEW `quote.explain` (why is the total X: per-group
  contributions and the drawn-but-not-priced list).
- **Do**: everything today, plus unlock `sketch` (draw/label/convert,
  `grid.set`, `grid.snap.toggle`), NEW `sketch.fill.set` (fill a closed drawn
  outline with a flat spectrum colour, by click or voice), `version`, `comment` (NEW voiceExamples:
  "leave a note on the spa saying...", "resolve that note"),
  `capture.coverage.describe`. Toolbar clicks route through `tool.activate`
  (bypass fix).

### 4.4 `/projects/[id]/import`

- **Explain** (NEW targets, NEW `import` GuideScreen member): Start an import,
  Upload images, Start calibration, Set scale, overlay toggles, Review queue,
  Apply to the project, Discard import.
- **Answer** (today via `page.read`; NEW `import.session.describe`): per-field
  confidence, which fields need review, scale state, apply-gate reasons.
- **Do** (today): full import command set. NEW: none needed beyond describe.

### 4.5 Document pages (proposal, construction, site-plan, screen RFQ)

- **Explain** (NEW targets, NEW `document` GuideScreen member): Print / Save as
  PDF, Back to project, page-size toggle (construction), pricing toggles
  (RFQ), sent-copy download.
- **Answer** (NEW `export.history.describe`): what was sent, when, hash, and
  whether the live render differs from the stored copy.
- **Do** (today): the four export commands, `project.proposal.accept`.

### 4.6 `/settings/price-book` and import wizard

- **Explain** (NEW targets): Add item, Import XLSX, per-row edit/delete,
  coverage panel, column mapping selects (import wizard).
- **Answer** (NEW `pricebook.describe`): active book and version, item count,
  coverage gaps (missing categories, never-bills units), untouched placeholder
  count, cost vs retail on a named item.
- **Do** (NEW commands replacing the server-action bypasses):
  `pricebook.item.add`, `pricebook.item.update`, `pricebook.item.remove`
  (destructive), `pricebook.version.create`. The XLSX import stays UI-only
  (file picking is not a voice job) but moves onto the registry for the audit
  row.

### 4.7 `/settings/company`

- **Explain** (NEW targets): the form regions, payment schedule Add stage /
  Remove stage, Save.
- **Answer** (via `page.read` today): tax rate, proposal terms, schedule.
- **Do**: NEW voiceExamples on `settings.company.update` ("set our sales tax
  to 7 percent", "make proposals valid for 45 days"). Payment schedule edits
  stay in the UI (structured list editing by voice is error-prone; Marco
  points instead).

### 4.8 `/settings/team`

- **Explain** (NEW targets): Invite somebody, role selects, Copy link on a
  minted invite, per-member actions.
- **Answer** (NEW `settings.team.describe`, read-only, category `settings`):
  who is on the team, roles, owner count, pending invites and expiry.
- **Do**: deliberately nothing. `team.ts` write commands stay voiceless
  (existing decision, kept). Marco explains and points; a human clicks.

### 4.9 `/settings/intake`

- **Explain** (NEW targets): Create link, Copy, Rename, Activate/Deactivate,
  recent submissions.
- **Answer / Do**: recategorize `import.intake.link.create/update/list` from
  `import` to `settings` so they surface here, where the UI lives. "Create a
  customer upload link called spring promo" then works on this page.

### 4.10 `/settings/voice`

- **Explain** (NEW target): the confirm-before-delete checkbox.
- **Do**: `settings.voice.set` surfaces here today but keeps its no-examples
  guard on the tools side? No: it HAS no examples by design so Marco cannot
  disarm his own confirmation gate. Kept exactly as is; Marco points at the
  checkbox and explains it instead.

### 4.11 `/settings/waitlist`, `/docs/*`

- Operator/reference pages. Globals only (`page.read`, `nav.*`, pointing at
  nav). No new commands; waitlist deliberately stays off the registry.

### 4.12 Cross-page state and context (NEW)

What already survives: the dock is mounted in the app shell, so the Gemini
session (and its conversation memory) survives client-side navigation; a
screen change reconnects on a resumption handle that carries the conversation.

What does not survive, and the design for each:

1. **Reloads and new sessions lose everything.** A session journal (client
   store persisted to sessionStorage, org+user keyed) keeps a rolling summary:
   last active project, last quote total read, the last ~15 voice command
   results, and a one-line summary of the previous conversation. Injected into
   `contextPrompt()` on every start and reconnect, so "keep going" works after
   a reload.
2. **Marco is blind to what the user did by hand on other pages.** The
   CommandAuditLog already records every UI action (and Phase 4 closes the
   bypasses, so coverage becomes complete). A read-only `context.recent`
   command returns the last N audit rows for this org/user as human sentences:
   "you archived Jones Backyard, added a waterfall, changed the tax rate".
   Global category, available on every screen.
3. **No durable memory across days.** Deferred: an org-scoped note store
   ("remember we always quote paver decks") is out of scope until the journal
   and recap prove out.

### 4.13 Ambient page awareness (all pages, NEW)

Two prompt-side additions, both cheap:

1. **Screen brief**: one hand-written paragraph per screen in `scope.ts`
   describing what the page is for and what Marco can do there, appended to
   `contextPrompt()`. Kills the "sounds lost" failure without any DOM reads.
2. **Page snapshot on connect and screen change**: the client runs the
   existing `readPage()` (title, headings, action labels only, truncated,
   marked untrusted) and sends it with `start()` / `setScreen()`, so Marco
   opens already knowing what is in front of the user instead of needing a
   tool round-trip to say anything specific.

---

## 5. Out of scope for this plan (flagged, not forgotten)

- **Local dev voice.** The relay is deployed in prod (see §1), but local dev
  has no `NEXT_PUBLIC_VOICE_RELAY_URL`, so the web dock is voice-dead in dev
  unless you run `pnpm voice:relay` and point the var at it, or use
  `pnpm electron:dev`. Worth a dev-setup note, not part of this plan. Also
  update the stale status lines in `docs/guide-agent-plan.md`.
- Pointing inside the WebGL canvas (world-space highlights). Still refused by
  design.
- The project form autosave bypass (28 fields through `saveProjectAction`).
  `project.update` gives voice a registry path; migrating the form itself is a
  separate cleanup.
- Voice for team writes, password resets, sign-out, and the waitlist.
