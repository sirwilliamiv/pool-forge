# Project page redesign: the five layouts

Route: `/projects/:id?layout=1..5` (no param = layout 1). All five are working
prototypes against the real data model, sharing one implementation
(`src/components/project/detail/`): the sections, the sticky header, the
focused address state and the save hook are the same instances everywhere, so
a fix lands in all of them. A small switcher pinned bottom-left hops between
them on any project.

**Billy's pick: layout 1.** It is the default; the others stay behind the
query param until we decide to strip them.

## What every option shares (the fixed decisions)

- **Address-first.** A project with no site address opens in a focused
  "Where is this pool going?" card: autocomplete address, customer name,
  phone, and a quiet Skip for now. Picking an address saves, resolves
  coordinates, and expands into the full page without a reload.
- **One address.** `Project.siteAddress` (+ `sitePlaceId`, `latitude`,
  `longitude`) is canonical. `Customer.address` survives only as a billing
  address behind a "Billing address is different" checkbox. Existing rows
  migrate lazily: the page reads the customer address as a fallback, and the
  next save writes the split back.
- **Workflow order.** Site & customer → Project → Designs → Pool →
  Equipment → Added to this job → Documents & share.
- **Sticky header** with back, inline-editable name, the status pill (the
  only place status is set), address, live quote total, save state,
  documents, one primary Open editor button, and an overflow menu for
  Import from image / Duplicate / Archive / Delete.
- **No bottom Save button.** Dependent specs (heater model, cage spec,
  fixture model) collapse when their option is off. Salesperson/Designer are
  datalist pickers fed by the team roster (free text still allowed, since the
  column stores a name and subs exist).
- **Documents say why.** Each document that cannot generate yet carries a
  reason line ("Needs a customer name and a priced design"), computed live
  from the form and the quote status.

## The options

| # | Shape | Save | Documents | Designs | Feel |
|---|---|---|---|---|---|
| 1 | Long page + jump nav (A1) | Autosave, status confirms side-effectful moves (B1) | Header group + full card at end (C1) | Card in workflow position (D1) | Closest to today, everything visible, least surprising. **Default.** |
| 2 | Two columns + summary rail (A2) | B1 | Header popover, no card (C2) | Compact strip (D3) | The rail keeps map/price/docs/share on screen while editing. Densest. |
| 3 | Tabs: Overview · Design · Specs (A3) | Autosave incl. status with 6s undo toast (B2) | Header popover (C2) | Card (D1) | Shortest pages. Documents tab dropped since C2 makes it redundant (substitution from the brief's pairing). |
| 4 | Designs hero + two-column forms (A4) | B1 | Group + card (C1) | Full-width rack under header (D2) | The drawing is the product; forms are secondary. |
| 5 | Long page + jump nav (A1) | Explicit Save in header with dirty count, Cmd/Ctrl+S, beforeunload guard (B3) | Card near top, collapsed until priced (C3) | Strip (D3) | The "feel the difference" B3 option. Status still applies immediately (with confirm): it is an action, not a field. |

## What it cost to build

- **Shared foundation (most of the work):** address autocomplete component +
  two new session-authed proxy routes (`/api/site/place`,
  `/api/site/staticmap` — the Google key never reaches the browser), the
  `project.update` and `project.status.set` registry commands, section
  extraction from the old 675-line ProjectForm, the sticky header, the
  focused state, the save hook with both models.
- **Per-layout cost after that:** composition only. Option 3's tabs and
  option 2's rail were each ~an hour; 4 and 5 are re-orderings.

## Data model changes

- `Project.siteAddress`, `sitePlaceId`, `latitude`, `longitude` — columns
  already introduced by migration `20260830221714_site_location` (from the
  marco-per-page branch, applied to the shared dev DB); that migration folder
  is now vendored on this branch too. No new migration needed.
- No FK for salesperson/designer: the picker constrains to
  `OrganizationMember` names but the column stays `String?` (existing data,
  subcontractors). A real FK is a follow-up if we want reassignment to
  cascade renames.

## The save path is now registry-first

The old page saved through an inline server action (raw Prisma), which
CLAUDE.md calls out as non-negotiable-ly wrong. Every field save now
dispatches `project.update` and every status change `project.status.set`,
each writing a `CommandAuditLog` row. Text saves are debounced 800ms;
discrete controls save immediately; the audit log gets one row per settled
edit, not per keystroke. Exports and validation read
`Project.siteAddress ?? Customer.address` so documents print the new field.

## Known gaps / notes

- "Feeds the satellite underlay in the editor" is forward-looking: the
  editor-side `site.import.satellite` command is still contract-only on this
  branch (it exists on marco-per-page). The address + coordinates are saved
  in exactly the shape that import consumes.
- Dark mode: tokens carry dark values but the app has no theme toggle, so
  parity is untested, same as the rest of the app.
- B3's navigation guard is `beforeunload` only; in-app `<Link>` navigations
  flush the pending save instead of prompting (autosave-on-leave, which is
  arguably better than a dialog).
- The layout switcher and the `?layout=` param are comparison chrome; once a
  winner is final, delete `LayoutSwitcher`, collapse `LAYOUTS` to the chosen
  spec, and the rest of the code is the production page.

## Screenshots (`shots/`)

- `l1-empty-focused.png` — new project, focused address state
- `l1-populated.png` — layout 1, populated (1440)
- `l1-1280.png` — layout 1 at 1280, no horizontal scroll
- `l2-populated.png` — summary rail
- `l3-populated.png` — tabs
- `l4-populated.png` — designs hero
- `l5-populated-dirty.png` — explicit save showing "Save · 2"

## Tests

- `src/test/unit/project-form.test.tsx` — autosave + one-question-per-option
  contracts, ported to the new sections and hook.
- `src/test/unit/project-page-labels.test.tsx` — a11y sweep over the whole
  editable surface (site + billing address included).
- `src/test/unit/projects/project-update.test.ts` — new integration tests for
  both commands against the real DB (org scoping, billing split, coordinate
  clearing, previousStatus echo).
- `src/test/e2e/build-a-pool.spec.ts` — updated for the focused state
  (Skip for now before the salesperson autosave assertion).
