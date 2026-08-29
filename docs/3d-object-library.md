# The 3D object library

What the competition ships, what Pool Forge ships, and what to build next.

## 1. Who the competition actually is

The pool-design category is not crowded. It is one company with three products.

**Structure Studios** makes **Pool Studio**, **Vip3D** and **VizTerra**. Vip3D is
the "pool VIP" name that gets half-remembered; VizTerra is the landscape-first
sibling; Pool Studio is the pool-first one. Same engine, same asset library,
different front doors and price points. Every other name in the market is either
a general 3D tool that happens to draw a pool, or business software with no
drawing at all.

| Product | Maker | Draws pools in 3D | Object library, as advertised |
|---|---|---|---|
| Pool Studio | Structure Studios | Yes | **2,924 hand-crafted 3D objects, 1,503 HD materials, 1,748 plants and trees** |
| VizTerra | Structure Studios | Yes, landscape-led | **1,922 3D objects and furniture, 1,241 HD materials, 1,748 trees and shrubs** |
| Vip3D | Structure Studios | Yes | "Thousands of objects", no published count |
| RealTime Landscaping Architect | Idea Spectrum | Yes, landscape-led | Large, uncounted; Windows only |
| Cedreo | Cedreo | Exteriors with pools | General home-design library |
| Chief Architect | Chief Architect | Yes, architecture-led | General architectural library |
| SketchUp + 3D Warehouse | Trimble | Only what you model | Effectively unlimited, and unvetted |
| ProDBX · Poologics · Jobber · JobTread · Houzz Pro · QuoteIQ · Pool Brain | various | **No 3D at all** | n/a |

Structure Studios added **1,400 new assets** in its 2023 update, which is the
rate a funded incumbent adds content at.

## 2. What the count actually means

2,924 is a marketing number and it should be read carefully before anyone tries
to match it.

Of the advertised library, **1,748 are plants**. Take those out and the
VizTerra figure of 1,922 objects is furniture, lighting, kitchen modules,
railings and decor. The genuinely pool-specific objects, the shells, the steps,
the spillways, the coping profiles, are a small fraction of the total, likely
low hundreds.

That matters because it tells you where the moat is not. Nobody switches
software because the other one has 40 more patio chairs. They switch because
their own pool, in their own back yard, looked real enough to sign. **Plants and
furniture are volume. Pool objects are the product.**

The right target is not 2,924. It is every object a Florida pool actually
contains, at a fidelity that sells, and nothing else.

## 3. What Pool Forge ships today

75 stencils. **20 of them have real 3D geometry. 55 render as a coloured box.**

Everything placed from the palette becomes `ShapeKind.STENCIL`
(`shapesStore.addStencil`), and `SceneRoot.renderStencilShape` special-cases
exactly fifteen stencil ids before falling through to `GenericStencil`, which is
a `boxGeometry` in the stencil's fill colour. The dedicated components for
pools, decks and spas exist but are only reachable by shapes that arrive from
seeds and templates, not by anything a user places.

Split the 55 and it becomes two different jobs:

- **16 are paper symbols** wrongly rendered as objects: approval blocks,
  dimension lines, construction notes, pricing blocks. A grey slab labelled
  "Total pricing block" standing in the yard is a bug, not a missing asset.
  These need **suppressing in 3D**, not modelling.
- **39 are real objects** that need real geometry.

### The 39

**Pool shells (10)** — every shape except the rectangle
`pool.round-corners` · `pool.grecian` · `pool.roman` · `pool.roman-two-master` ·
`pool.roman-two-point-one-master` · `pool.freeform-kidney` ·
`pool.rectangle-pool-and-spa` · `pool.grecian-pool-and-spa` ·
`pool.roman-pool-and-spa` · `pool.freeform-pool-and-spa`

**Water and fire (9)**
`water.water-bowl` · `water.fire-bowl` · `water.waterfall` · `water.raised-wall` ·
`water.spillway` · `water.deck-jet` · `water.spa-spillover` · `water.fire-pit` ·
`water.outdoor-kitchen`

**Deck and structure (14)**
`deck.lanai` · `deck.covered-lanai` · `deck.screen-cage` · `deck.pillar` ·
`deck.corner-pillar` · `deck.wall` · `deck.raised-deck` · `deck.waterfall-wall` ·
`deck.step-down` · `deck.coping-strip` · `deck.fence` · `deck.drain-line` ·
`deck.deco-drain` · `deck.access-arrow`

**In-pool features (6)**
`feature.swim-out-bench` · `feature.umbrella-hole` · `feature.main-drain` ·
`feature.return` · `feature.deep-end-marker` · `feature.shallow-end-marker`

## 4. Build these before inventing new ones

The gap that loses a demo is not the object Pool Forge lacks. It is the object
Pool Forge lists, lets a builder place, prices correctly, and then draws as a
grey box. A missing object is a shrug. A box where the customer's pool should be
is the moment the builder closes the laptop.

So the order is: **fix the 39, hide the 16, then extend.**

### Then extend, in this order

Ranked by how often a Florida pool contains one and how much it adds to a
contract, not by how interesting it is to model.

1. **Screen enclosure, structurally** — mansard and gable roofs, real beam and
   chair-rail spacing, door panels. `deck.screen-cage` exists as a stencil and
   this is the single most Florida-specific object in the product.
2. **Paver field patterns** — herringbone, running bond, French pattern. This
   is a material treatment on existing deck geometry, not a new object, and it
   changes how finished a plan looks more than any single model.
3. **Pergola and pavilion** — the most commonly attached structure.
4. **Outdoor kitchen as modules** — counter run, grill, sink, fridge, bar
   overhang. Currently one stencil pretending to be a room.
5. **Raised bond beam and retaining walls** with cap and veneer options.
6. **Equipment pad, itemised** — pump, filter, heater, salt cell. Sells the
   equipment upgrade and doubles as the permit sheet detail.
7. **Handrail, ladder, dive rock, slide** — small, cheap, always asked about.
8. **Safety fence and auto cover** — required by code in most jurisdictions.
9. **Landscape minimum** — 4 to 6 palm species, not a plant encyclopaedia.
   Sabal, queen, foxtail, areca. Florida sells on palms.
10. **Furniture minimum** — chaise, dining set, umbrella, fire table. Enough to
    dress a render, not a catalogue.

## 5. How to build one here

An object is a React Three Fiber component in
`src/components/editor/three/objects/`, dispatched by stencil id in
`SceneRoot.renderStencilShape`. There are twenty-one of them already: read
`Steps.tsx`, `SunShelf.tsx` and `Spa.tsx` before writing a new one.

Two things to settle before object number 22:

**Replace the if-chain with a registry.** The dispatch is currently five
`if (SET.has(id))` blocks. At 39 more objects that is unreadable and untestable.
A `Record<StencilId, ComponentType<{shape: Shape}>>` keyed by stencil id, with
`GenericStencil` as the explicit fallback, makes coverage countable, and makes
"which stencils still render as a box" a test rather than a memory.

**Prefer parametric geometry over imported meshes.** Every object here has to
resize to the dimensions a builder typed, and those dimensions drive
measurements and price. A fixed `.glb` cannot stretch to a 32 foot spillway
without lying about it. Model in code, from the shape's own width, height and
depth, the way `Steps.tsx` already does. Import meshes only for objects with no
dimensional meaning: furniture, plants, a grill.

**A box is a legitimate answer, once.** `GenericStencil` should stay, but it
should be reached deliberately, not by falling off the end of a chain.
