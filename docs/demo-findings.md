# Demo findings — 2026-08-20

What the recorded walkthrough (`pnpm demo`) turned up while filming every screen.
Recorded rather than fixed, per the brief: keep filming, note what breaks.

The distinction that matters below is between **a real gap in the product** and
**a bug in the recording harness**. Roughly half of what a first pass reports is
the latter, and calling those defects would be misleading.

## Real gaps

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

### 2. The editor's first compile can exceed 60 seconds in dev

The first visit to `/projects/[id]/editor` after a server start compiles a heavy
3D route on demand, and it outran a 60-second wait while the machine was busy.
Every later visit is cached and loads in about 3 seconds.

**Not a production issue**, since a built server has no on-demand compile. It is
worth knowing locally because it presents as a blank editor with no error, which
is indistinguishable from a broken scene. Confirmed not a product bug: a
brand-new project with no `Drawing` row renders in 2.9s once the route is warm.
`00-warmup.spec.ts` exists to absorb this before any chapter records.

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
