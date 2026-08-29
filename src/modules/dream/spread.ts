// How wide the ballpark is, and what each part of the width is admitting to.
//
// A range on a marketing page is usually decoration: somebody picks plus or
// minus fifteen percent because a single number looked too confident, and the
// range means nothing more than "we are not sure". That is a worse lie than the
// single number, because it looks like a measurement of uncertainty and is not.
//
// This one is built the other way round. Every contribution below names one
// thing the studio genuinely cannot know from eleven multiple-choice answers,
// and the width is the sum of those admissions. A plunge pool with a concrete
// walkway and no extras is a well-understood job and comes out near the floor.
// An estate pool with a screen enclosure, a spa and four water features is a
// job whose price depends heavily on a site nobody has visited, and it comes
// out near the ceiling.
//
// The consequence worth stating: the range narrows when the design gets
// simpler, which is the opposite of what a decorative percentage does, and it
// is the behaviour that makes the number worth showing at all.

import { budgetById, deckSizeById, sizeById } from './catalog'
import type { DreamConfig } from './config'

/**
 * The width nothing can remove.
 *
 * Ground conditions, access for a digger, the local permit regime and regional
 * labour rates. Every one of these moves a real pool's price and none of them
 * is knowable from a postcode-free web page, so no design comes out tighter
 * than this.
 */
export const IRREDUCIBLE_SPREAD = 0.12

/**
 * The widest the range is allowed to get.
 *
 * Past about a third either way the range stops being information: "somewhere
 * between $90k and $180k" tells a homeowner nothing they did not already know
 * and reads as an evasion. A design that would exceed this is one the studio
 * should stop guessing about and hand to a builder, which is what the nudge in
 * `nudges.ts` says when the ceiling is hit.
 */
export const MAX_SPREAD = 0.32

interface SpreadTerm {
  /** Whether this design carries this uncertainty at all. */
  readonly applies: (config: DreamConfig) => boolean
  /** How much width it adds. */
  readonly weight: number
  /** What it is admitting to, in words a homeowner can read. */
  readonly reason: string
}

const TERMS: readonly SpreadTerm[] = [
  {
    // Excavation is the line that moves most with ground nobody has dug, and a
    // bigger hole multiplies whatever surprise is down there.
    applies: (c) => {
      const size = sizeById(c.size)
      return size.lengthFt * size.widthFt >= 500
    },
    weight: 0.04,
    reason: 'A pool this size moves enough earth that what is under your yard starts to matter',
  },
  {
    // A diving well is the deepest anybody digs in a back yard, and depth is
    // where water tables, rock and shoring appear.
    applies: (c) => c.depth === 'diving',
    weight: 0.04,
    reason: 'Digging to diving depth is where rock and groundwater turn up',
  },
  {
    // Cage pricing is a different trade with its own regional market, and it is
    // the one thing here that nothing in the design measures.
    applies: (c) => c.screenEnclosure,
    weight: 0.06,
    reason: 'Screen enclosures are priced by a separate trade and vary widely by region',
  },
  {
    // A spa is plumbing, a second heater load and a structure, and how it is
    // built depends on how it meets the pool.
    applies: (c) => c.spa,
    weight: 0.03,
    reason: 'How a spa meets the pool changes what it costs to build',
  },
  {
    // "A water feature" covers a $900 bowl and a $14,000 grotto.
    applies: (c) => c.waterFeatures > 0,
    weight: 0.03,
    reason: 'Water features range from a simple bowl to a built stone feature',
  },
  {
    // A large deck is the part of the job most likely to need retaining, steps
    // or drainage that only a survey reveals.
    applies: (c) => deckSizeById(c.deckSize).areaFactor >= 1.5,
    weight: 0.03,
    reason: 'A deck this large usually needs grading work only a site visit can size',
  },
  {
    // Stone is quarried, shipped and laid by hand, so its installed price moves
    // with freight and with who is available to lay it.
    applies: (c) => c.deckMaterial === 'travertine',
    weight: 0.02,
    reason: 'Natural stone prices move with freight and with who is laying it',
  },
]

/**
 * The reasons this particular design is uncertain, for showing to the visitor.
 *
 * Exported alongside the number because a range with its reasons printed under
 * it is an argument, and a range on its own is a shrug.
 */
export function spreadReasons(config: DreamConfig): string[] {
  return TERMS.filter((t) => t.applies(config)).map((t) => t.reason)
}

/** The half-width of the ballpark, as a fraction of the mid figure. */
export function ballparkSpread(config: DreamConfig): number {
  const added = TERMS.reduce((sum, term) => (term.applies(config) ? sum + term.weight : sum), 0)
  return Math.min(MAX_SPREAD, IRREDUCIBLE_SPREAD + added)
}

/** True when the design has outrun what this page can usefully guess at. */
export function isAtSpreadCeiling(config: DreamConfig): boolean {
  return ballparkSpread(config) >= MAX_SPREAD
}

/**
 * Where a ballpark sits against the budget somebody named.
 *
 * `null` when they said they had no idea, which is most people: the bar is
 * hidden rather than drawn against an invented ceiling.
 */
export type BudgetVerdict =
  /** Comfortably inside. */
  | { readonly kind: 'under'; readonly ceiling: number; readonly usedFraction: number }
  /** Inside, but the top of the range is not. */
  | { readonly kind: 'tight'; readonly ceiling: number; readonly usedFraction: number }
  /** The middle of the range is past the number they gave. */
  | { readonly kind: 'over'; readonly ceiling: number; readonly usedFraction: number }
  | null

/**
 * Judge the design against the budget.
 *
 * The comparison is against `mid`, not `low`. Measuring against the bottom of
 * the range would let every design read as affordable, which is the flattering
 * answer and the one that wastes a builder's first phone call.
 */
export function budgetVerdict(
  config: DreamConfig,
  ballpark: { low: number; mid: number; high: number },
): BudgetVerdict {
  const ceiling = budgetById(config.budget).ceiling
  if (ceiling === null || ceiling <= 0) return null

  const usedFraction = ballpark.mid / ceiling
  if (ballpark.mid > ceiling) return { kind: 'over', ceiling, usedFraction }
  if (ballpark.high > ceiling) return { kind: 'tight', ceiling, usedFraction }
  return { kind: 'under', ceiling, usedFraction }
}
