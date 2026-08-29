// What a homeowner is allowed to choose, and what each choice actually is.
//
// Everything here is a closed list. The studio is a public page, its state
// travels in a URL, and a URL is a stranger's input: a free-typed pool shape or
// an arbitrary deck multiplier is a way to make this page print any number
// somebody likes and screenshot it next to our logo. Every option therefore has
// an id the schema can check against, and the geometry lives beside the id
// rather than in the component that renders it.
//
// The labels are written for somebody who has never bought a pool. "Sport" and
// "Roman end" are trade words; "a straight lane you can actually swim in" is
// what the person on the page is choosing between.

/** Internal geometry unit, matching `src/lib/geometry`. */
const INCHES_PER_FOOT = 12

export interface ChoiceMeta {
  readonly id: string
  /** What the option is called on screen. */
  readonly label: string
  /** One line under the label. Written for a homeowner, not a builder. */
  readonly blurb: string
}

// ---------------------------------------------------------------------------
// Pool shape
// ---------------------------------------------------------------------------

/**
 * How the footprint's area and edge are worked out.
 *
 * A shape is not just a picture: a kidney of the same bounding box as a
 * rectangle holds less water and has more edge, and both facts are money. The
 * two coefficients say how much of the bounding box the water fills and how
 * much longer the edge runs than the box's own perimeter, which is enough to
 * price every shape here off the two primitives the editor already uses.
 */
export interface ShapeMeta extends ChoiceMeta {
  /**
   * Fraction of the bounding box the water occupies.
   *
   * 1 for a rectangle by definition. A true ellipse is pi/4, and the curved
   * shapes below sit between the two because they are ellipses with a straight
   * run in them.
   */
  readonly areaFactor: number
  /**
   * Edge length as a multiple of the bounding box perimeter.
   *
   * Below 1 for anything rounded (a corner cut off is shorter than going round
   * it) and above 1 only for shapes that fold back on themselves, which is why
   * the L-shape is the one entry over 1.
   */
  readonly perimeterFactor: number
  /** Which renderer draws it. The SVG path generator switches on this. */
  readonly outline: 'rect' | 'oval' | 'kidney' | 'ell'
}

export const POOL_SHAPES: readonly ShapeMeta[] = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    blurb: 'Clean lines, the most swimmable water for the money.',
    areaFactor: 1,
    perimeterFactor: 1,
    outline: 'rect',
  },
  {
    id: 'roman',
    label: 'Roman end',
    blurb: 'A rectangle with one curved end. Formal without being fussy.',
    areaFactor: 0.95,
    perimeterFactor: 0.98,
    outline: 'rect',
  },
  {
    id: 'oval',
    label: 'Oval',
    blurb: 'Soft all the way round. Reads as a garden feature, not a lane.',
    // pi/4: the exact ratio of an ellipse to the box it sits in.
    areaFactor: Math.PI / 4,
    perimeterFactor: 0.9,
    outline: 'oval',
  },
  {
    id: 'kidney',
    label: 'Kidney',
    blurb: 'The classic curve. Tucks around a tree or a corner of the yard.',
    areaFactor: 0.78,
    perimeterFactor: 0.96,
    outline: 'kidney',
  },
  {
    id: 'ell',
    label: 'L-shape',
    blurb: 'A shallow end for the kids and a deep leg for everyone else.',
    areaFactor: 0.72,
    // The only shape whose edge is longer than its bounding box: the inside
    // corner is walked twice.
    perimeterFactor: 1.08,
    outline: 'ell',
  },
]

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export interface SizeMeta extends ChoiceMeta {
  /** Bounding box, in feet, the way a homeowner reads a pool size. */
  readonly lengthFt: number
  readonly widthFt: number
}

export const POOL_SIZES: readonly SizeMeta[] = [
  {
    id: 'plunge',
    label: 'Plunge',
    blurb: "10' x 20'. Cools you off, fits a small yard, cheap to run.",
    lengthFt: 20,
    widthFt: 10,
  },
  {
    id: 'compact',
    label: 'Compact',
    blurb: "12' x 24'. The smallest pool a family of four does not outgrow.",
    lengthFt: 24,
    widthFt: 12,
  },
  {
    id: 'family',
    label: 'Family',
    blurb: "16' x 32'. The size most people picture when they picture a pool.",
    lengthFt: 32,
    widthFt: 16,
  },
  {
    id: 'entertainer',
    label: 'Entertainer',
    blurb: "18' x 38'. Room for a party and a swim at the same time.",
    lengthFt: 38,
    widthFt: 18,
  },
  {
    id: 'estate',
    label: 'Estate',
    blurb: "20' x 45'. A serious piece of water. Priced like one.",
    lengthFt: 45,
    widthFt: 20,
  },
]

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

export interface DepthMeta extends ChoiceMeta {
  readonly shallowFt: number
  readonly deepFt: number
}

export const DEPTH_PROFILES: readonly DepthMeta[] = [
  {
    id: 'wading',
    label: 'Shallow throughout',
    blurb: "3'6\" everywhere. Safest with small children, cheapest to build.",
    shallowFt: 3.5,
    deepFt: 3.5,
  },
  {
    id: 'standard',
    label: 'Shallow to deep',
    blurb: "3'6\" to 6'. Stand up at one end, swim at the other.",
    shallowFt: 3.5,
    deepFt: 6,
  },
  {
    id: 'diving',
    label: 'Diving depth',
    blurb: "4' to 8'6\". Deep enough to dive. More water, more excavation.",
    shallowFt: 4,
    deepFt: 8.5,
  },
]

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

export interface DeckMeta extends ChoiceMeta {
  /**
   * Paving area as a multiple of the pool's own surface area.
   *
   * Expressed against the pool rather than in square feet because that is how
   * a deck actually scales: a 4' walk-round is a different number on a plunge
   * pool and on an estate pool, and a fixed figure would make one of them
   * absurd.
   */
  readonly areaFactor: number
}

export const DECK_SIZES: readonly DeckMeta[] = [
  {
    id: 'minimal',
    label: 'Just a walkway',
    blurb: 'Enough to get round the pool safely. Nothing more.',
    areaFactor: 0.55,
  },
  {
    id: 'lounging',
    label: 'Room for loungers',
    blurb: 'A proper sunbathing side and space to put a table.',
    areaFactor: 1.1,
  },
  {
    id: 'entertaining',
    label: 'An outdoor room',
    blurb: 'Dining, seating and circulation. This is where the party happens.',
    areaFactor: 1.9,
  },
]

export interface DeckMaterialMeta extends ChoiceMeta {
  /**
   * Multiplier on the deck rate in the reference price list.
   *
   * The list carries one deck line (broom-finished concrete, the default
   * everywhere) and these scale it, rather than the list carrying four deck
   * lines. `computeQuote` hands a category's measured quantity to every item in
   * it, so four deck lines in one book would bill the same slab four times.
   */
  readonly rateFactor: number
  /** Fill used when the yard is drawn. */
  readonly swatch: string
}

export const DECK_MATERIALS: readonly DeckMaterialMeta[] = [
  {
    id: 'concrete',
    label: 'Broom-finished concrete',
    blurb: 'The default. Tough, grippy underfoot, and the least expensive.',
    rateFactor: 1,
    swatch: '#D8D5CE',
  },
  {
    id: 'pavers',
    label: 'Concrete pavers',
    blurb: 'Laid in a pattern. Lifts and relays if the ground ever moves.',
    rateFactor: 1.55,
    swatch: '#C9BFAE',
  },
  {
    id: 'travertine',
    label: 'Travertine',
    blurb: 'Natural stone that stays cool in full sun. The one people touch.',
    rateFactor: 2.2,
    swatch: '#E4DACB',
  },
]

// ---------------------------------------------------------------------------
// Interior finish
// ---------------------------------------------------------------------------

export interface FinishMeta extends ChoiceMeta {
  /** Multiplier on the shell rate, which carries the interior with it. */
  readonly rateFactor: number
  /** The water colour this finish produces, for the yard drawing. */
  readonly water: string
}

export const INTERIOR_FINISHES: readonly FinishMeta[] = [
  {
    id: 'plaster',
    label: 'White plaster',
    blurb: 'Bright, classic, pale blue water. Refinished about every ten years.',
    rateFactor: 1,
    water: '#5FC8E8',
  },
  {
    id: 'quartz',
    label: 'Quartz blend',
    blurb: 'Harder than plaster and lasts longer. Deeper blue.',
    rateFactor: 1.18,
    water: '#2FA8D8',
  },
  {
    id: 'pebble',
    label: 'Pebble',
    blurb: 'Textured stone finish. The longest-lived, and the darkest water.',
    rateFactor: 1.4,
    water: '#127FA8',
  },
]

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

/**
 * The things a homeowner adds one at a time and watches the number move.
 *
 * Counts rather than booleans where a person can genuinely want two, because
 * "how many" is a more interesting question than "yes or no" and the pricing
 * engine already measures both by count.
 */
export const MAX_WATER_FEATURES = 4
export const MAX_LIGHTS = 8

/** Lights a pool of this surface area needs before anybody calls it a feature. */
export function baselineLightCount(poolAreaSqft: number): number {
  if (poolAreaSqft <= 0) return 0
  // One fixture lights roughly 300 square feet of water well enough to swim by.
  return Math.max(1, Math.round(poolAreaSqft / 300))
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface BudgetMeta extends ChoiceMeta {
  /**
   * The number the bar is measured against, in dollars.
   *
   * Null means the visitor said they have no idea, which is the honest answer
   * for most people arriving here. The bar is hidden in that case rather than
   * being measured against an invented figure.
   */
  readonly ceiling: number | null
}

export const BUDGETS: readonly BudgetMeta[] = [
  { id: 'unknown', label: 'No idea yet', blurb: 'Show me what things cost.', ceiling: null },
  { id: 'under-60', label: 'Under $60k', blurb: 'Keep it tight.', ceiling: 60_000 },
  { id: '60-90', label: '$60k to $90k', blurb: 'The usual range.', ceiling: 90_000 },
  { id: '90-130', label: '$90k to $130k', blurb: 'Room to add the good things.', ceiling: 130_000 },
  { id: 'over-130', label: 'Over $130k', blurb: 'Build the backyard properly.', ceiling: 200_000 },
]

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Find an option by id, falling back to the first in the list.
 *
 * Never throws, and that is deliberate. These are read while decoding a URL
 * somebody may have edited or truncated, and the right answer to a shape id
 * that does not exist is the default pool, not a 500 on a marketing page. The
 * Zod schema in `config.ts` is what refuses a bad id at the boundary; this is
 * the belt to that pair of braces.
 */
function lookup<T extends ChoiceMeta>(list: readonly T[], id: string): T {
  const found = list.find((o) => o.id === id)
  if (found) return found
  const first = list[0]
  // `noUncheckedIndexedAccess` is on, and a catalogue list is never empty: the
  // tests assert it, because an empty list here would mean no pool at all.
  if (!first) throw new Error('empty catalogue list')
  return first
}

export const shapeById = (id: string): ShapeMeta => lookup(POOL_SHAPES, id)
export const sizeById = (id: string): SizeMeta => lookup(POOL_SIZES, id)
export const depthById = (id: string): DepthMeta => lookup(DEPTH_PROFILES, id)
export const deckSizeById = (id: string): DeckMeta => lookup(DECK_SIZES, id)
export const deckMaterialById = (id: string): DeckMaterialMeta => lookup(DECK_MATERIALS, id)
export const finishById = (id: string): FinishMeta => lookup(INTERIOR_FINISHES, id)
export const budgetById = (id: string): BudgetMeta => lookup(BUDGETS, id)

/** Bounding box of a size choice, in inches, which is what the geometry takes. */
export function sizeInches(size: SizeMeta): { widthIn: number; heightIn: number } {
  return { widthIn: size.widthFt * INCHES_PER_FOOT, heightIn: size.lengthFt * INCHES_PER_FOOT }
}
