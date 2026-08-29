# Demo findings — 2026-08-20

What the recorded walkthrough (`pnpm demo`) turned up while filming every screen.
Recorded rather than fixed, per the brief: keep filming, note what breaks.

The distinction that matters below is between **a real gap in the product** and
**a bug in the recording harness**. Roughly half of what a first pass reports is
the latter, and calling those defects would be misleading.

## Real gaps

**Status, 2026-08-22.** Gaps 1, 3 and the missing fit control are fixed; gap 2 is
a dev-only compile cost and gap 4 is the documented design. See the notes under
each.

### 1. The pool tool exposes 4 of 17 pool shapes

`src/components/editor/shell/PoolShapePicker.tsx` hardcodes its own list:

```ts
const POOL_SHAPES: PoolShape[] = [
  { stencilId: 'pool.rectangle', label: 'Rectangle' },
  { stencilId: 'pool.roman', label: 'Roman' },
  { stencilId: 'pool.grecian', label: 'Grecian' },
  { stencilId: 'pool.freeform-kidney', label: 'Kidney' },
]
```

The catalog holds 17 `POOL_SHAPE` stencils. Thirteen never appear when a builder
reaches for the pool tool, including every pool-and-spa combination and all the
step variants:

```
round-corners · roman-two-master · roman-two-point-one-master
standard-steps · one-step · step-sets · corner-steps · square-steps
spa · rectangle-pool-and-spa · grecian-pool-and-spa
roman-pool-and-spa · freeform-pool-and-spa
```

**Severity: moderate, not blocking.** The catalog sweep confirms all 72 stencils
are reachable from the Stencils panel, so this is discoverability rather than
dead functionality: a builder who reaches for the obvious tool sees a quarter of
what exists. The fix is to derive the picker from the catalog instead of a local
array, which also stops the two lists drifting apart again.

**Fixed.** The picker reads `stencilsByCategory()[POOL_SHAPE]`, so all seventeen
appear and adding one to the catalogue puts it in the tool. The list scrolls,
since seventeen do not fit on screen at once.

### 2. The editor's first compile can exceed 60 seconds in dev

The first visit to `/projects/[id]/editor` after a server start compiles a heavy
3D route on demand, and it outran a 60-second wait while the machine was busy.
Every later visit is cached and loads in about 3 seconds.

**Not a production issue**, since a built server has no on-demand compile. It is
worth knowing locally because it presents as a blank editor with no error, which
is indistinguishable from a broken scene. Confirmed not a product bug: a
brand-new project with no `Drawing` row renders in 2.9s once the route is warm.
`00-warmup.spec.ts` exists to absorb this before any chapter records.

### 3. Objects drop in a column, not where you point

`StencilGrid.tsx` computes placement as `pool.x + pool.width + 24`, staggered
36 inches per object already on the sheet. There is no drag-to-place from the
panel and no drop target, so chapter 11's thirty-six objects land in a line
running roughly ninety-six feet down the sheet.

Everything is draggable afterwards, so nothing is blocked. But it is the
clearest thing standing between this app and a layout a builder would show a
customer: you can price a yard accurately today without being able to compose
one.

The same function only anchors to `RECTANGLE_POOL`, so a Grecian or
pool-and-spa stencil leaves every later object stranded at the origin.

**Fixed.** `stagingPlacement` anchors to the bounds of everything visible rather
than to one shape kind, and stages objects in a wrapping block beside the
drawing instead of a queue: thirty-six objects now span under sixty feet
instead of ninety-six, and a Grecian pool no longer strands everything at the
origin. Slot size follows the stencil's own dimensions, so a lanai does not
overlap its neighbours.

Still not drag-to-place, which is what this really wants. It is a staging area
rather than a queue, and `canvas.fit` now exists to get back to it.

### 4. Placement is a click, not a drag

`ToolGestures.tsx` abandons placement once the pointer moves more than four
pixels, treating it as a camera orbit. A pool is placed with a single click and
then sized numerically in the inspector, which matches the note in
`build-priority.md` that resize and rotate are inspector fields rather than
on-canvas handles.

Worth knowing because the failure is silent: dragging to "draw" a pool orbits
the camera and creates nothing, with no error.

## Harness bugs, not product defects

Recorded here so a later run does not re-report them as findings.

| Reported as | Actually |
|---|---|
| "customer proposal link missing on the project page" | It is a `<Button>` dispatching `export.customerProposal`, not an `<a>`. The selector looked only for anchors. |
| "no file input on the import screen" | The upload control only renders in the empty state. A session that already holds an image shows the review screen, which correctly has no file input. |
| "pool tool did not present a shape picker" | The picker does open. The spec clicked `[aria-label="Pool shape"]`, which matches both the toolbar button and the picker trigger. |
| Chapters 2 and 9 hanging for ten minutes | A dialog left open intercepted every later click. Overlays are now dismissed explicitly between phases. |
| Chapter 6 crashing on a selector | Playwright cannot mix a CSS selector and a `text=` engine in one string. |
| Chapter 9 timing out on the view switcher | The Plan/3D/Section control sits on the bottom edge of the viewport, so a click waits on actionability. Scrolled into view first. |
| "the pool tool does not activate" | It does. The trigger opens a Radix dropdown whose entries are `[role="menuitem"]`, not buttons, so a lookup for a button never selected a family and the tool never armed. |

## What the sweep confirmed works

- **All 72 stencils** are present and findable in the Stencils panel across all
  five categories.
- Every toolbar tool is mounted with a working `aria-label` and single-key
  shortcut: move, pool, steps, water, lights, deck, brush, measure, annotation,
  comment.
- All five camera presets, all three view modes, and all four workflow tabs
  respond.
- All four document entry points are present on the project page.
- A brand-new project with no drawing row opens the editor cleanly.

## Regression cover, 2026-08-22

Every defect this project found by hand should be a test that would have caught
it. The audit below is the state after that sweep. `src/test/unit/regressions.test.ts`
holds the ones that had no cover at all; the rest are guarded next to the code
they belong to.

| Defect, as the user hit it | Guarded by |
|---|---|
| The pool tool showed 4 of 17 shapes | `unit/regressions.test.ts` (new) |
| Every generic stencil was called "Stencil" in the layers panel | `unit/regressions.test.ts` (new) |
| A Grecian or pool-and-spa stranded every later object at the origin | `unit/three/placement.test.ts` |
| Thirty-six objects ran ninety-six feet down the sheet | `unit/three/placement.test.ts` |
| The deck was a solid slab over the water | `unit/three/deck-cutouts.test.ts` |
| `canvas.fit` was registered and never implemented | `unit/commands/wiring.test.ts`, `unit/three/framing.test.ts`, `unit/commands/handler-behaviour.test.ts` |
| Coping had no id, so nothing could remove it | `unit/three/shape-commands.test.ts`, `unit/commands/handler-behaviour.test.ts` |
| `delete.shape` echoed the ids it was asked to delete | `unit/commands/handler-behaviour.test.ts` |
| move / resize / rotate succeeded against an unknown id | `unit/commands/handler-behaviour.test.ts`, `unit/regressions.test.ts` (sweep) |
| A voice loop of add/add/add/undo/undo/undo | `unit/voice/session.test.ts` |
| A typed project name was lost on navigation | `unit/project-form.test.tsx` |
| "5' easement" was rejected as an unreadable dimension | `unit/imports/vision/parsing.test.ts` |
| A missed drop navigated the browser away from the app | `unit/imports/file-drop.test.tsx` |

### Still broken: eleven more commands that report success and change nothing

The unknown-id fix reached five commands. Eleven others still accept an id that
is not on the canvas, return ok, and change nothing:

```
shape.rename · shape.hide · shape.lock · duplicate.shape · pool.shape.set
pool.flip · pool.lock.ratio · pool.geometry.update · pool.depth.set
set.shape.material · pool.material.set
```

Each is a sentence the app will say to someone that is not true, and every one
is offered to the voice agent. The sweep in `unit/regressions.test.ts` pins the
list: it should only ever get shorter, and adding a new shape mutation without a
guard fails it.

`set.shape.material` and `pool.material.set` are worse than the rest. Both are
pure echoes that persist nothing for a shape that *is* there, so a builder who
picks a Cobalt interior is told it is set, sees no change on the drawing, and
finds no record of it anywhere but the audit log. The handlers say so in a
comment; nothing said so to the user.
