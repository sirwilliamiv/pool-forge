# Showcase demo — plan

The nine teaching chapters each cover one idea in about forty seconds. This is
the opposite: one long take that builds a complete high-end backyard and shows
the app carrying a real job, not a toy.

**Target:** 6 to 9 minutes, recorded as `11-showcase.spec.ts`, alongside the
existing chapters rather than replacing them.

## What gets built

A pool-and-spa with the full complement of features, then the yard around it.
Every object below is a real entry in the 72-stencil catalog, so nothing here is
aspirational.

**The pool** — rectangle drawn with the pool tool, sized to roughly 34 x 17 ft.
It has to be a `RECTANGLE_POOL`, not a combination stencil, for the reason in
Constraints below.

**Interior** (`INTERIOR_FEATURE`, 12 available, using 10)
Sun shelf · Tanning ledge · Swim out bench · Bench · Bubblers · Umbrella hole ·
Deck jets · Main drain · Return · Light

**Water and fire** (`WATER_OUTDOOR`, 9 available, using all 9)
Spa spillover · Waterfall · Spillway · Water bowl · Fire bowl · Fire pit ·
Deck jet · Raised wall · Outdoor kitchen placeholder

**The yard** (`DECK_HOUSE`, 17 available, using 11)
Paver deck · Coping strip · Raised deck · Waterfall wall · Step down ·
Covered lanai · Pillar · Screen cage · Fence · Deco drain · Grass area

**Documentation layer** (`CONSTRUCTION_SYMBOL`, using 6)
Equipment pad · Property line · Setback line · Dimension line ·
Construction notes block · Job specification block

That is 36 objects plus the pool: enough to look like a real estate job and to
move the quote somewhere interesting.

## Sequence

Each beat exists to show something the shorter chapters could not.

1. **Empty lot** — new project, empty editor, quote reads nothing. The baseline
   the rest is measured against.
2. **The pool** — draw it, then read surface area, perimeter, volume and wetted
   area off the panel. First money on the board.
3. **Interior features** — add all ten and watch wetted area move, since that is
   what drives the finish cost. Narrate why a tanning ledge is not free.
4. **Water and fire** — the nine water and fire objects. These are the line
   items that separate a mid-range job from a high-end one.
5. **The yard** — deck, coping, raised deck, lanai, screen cage, fence. Deck
   square footage is usually the second largest number on a quote.
6. **Materials** — assign finishes, then show the same geometry at a different
   price. This is the clearest demonstration that materials are not cosmetic.
7. **Construction layer** — equipment pad, property line, setbacks, dimension
   lines, notes blocks. What the crew and the permit office need.
8. **Validation** — open the dock against a design complex enough to actually
   trip rules, rather than a bare rectangle that passes everything.
9. **The quote** — full line-item breakdown on a real build.
10. **Documents** — all four, on a design worth putting in front of a customer.
11. **Views** — plan, 3D, section, and the four workflow modes over a scene with
    enough in it that the modes visibly differ.

## Constraints this has to work within

**Stencils drop in a staggered column, not where you point.** `StencilGrid`
computes position as `pool.x + pool.width + 24`, staggered 36in per existing
stencil. There is no drag-to-place from the panel and no drop target. With 36
objects the last one lands roughly 108 ft below the first, so the showcase will
read as a catalog laid out beside the pool rather than a composed backyard.

This is worth recording as a finding in its own right: it is the single biggest
thing standing between this app and a design a builder would show a customer.

**The anchor only recognises rectangle pools.** `shapes.find(s => s.kind === ShapeKind.RECTANGLE_POOL)`
means a Grecian or combination pool-and-spa stencil leaves every later stencil
anchored at the origin. Hence a plain rectangle for the pool.

**Repositioning is possible but slow.** The move tool can drag objects, but each
drag is a scripted mouse gesture against a 3D scene, and doing 36 of them would
add minutes of tedious video for a layout that is still approximate. The plan is
to drag three or four hero objects into place to show manipulation works, and
let the rest stagger.

## How it gets verified

Recording something that looks busy is not the same as recording something that
works. After the run:

- Assert object count in the drawing matches what was placed.
- Assert the quote total moved from zero and the computed measurements are
  non-zero.
- Pull frames at the end of each beat and actually look at them, rather than
  trusting a green test.
- Note every object that failed to place, rather than quietly filming a gap.
