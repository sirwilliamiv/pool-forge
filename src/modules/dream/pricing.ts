// What the studio charges for things, and why it is a separate list.
//
// WHY NOT THE STARTER BOOK
//
// `modules/onboarding/starter-price-book.ts` already holds a complete set of
// rates, and reusing it here would have been one import. It says of itself:
// "The numbers are placeholders. They are not a recommendation, they are not
// market research." That statement is fine on a page where the only reader is
// the builder who is about to overwrite them. It is not fine in front of a
// member of the public, who has no way to know the number was invented and no
// price book of their own to correct it with.
//
// So the studio carries its own list, and the list has a different job: to be
// the middle of a plausible national range for the work described, so that the
// ballpark a homeowner sees is wrong by an amount the stated range covers
// rather than by an amount nobody has measured. `REFERENCE_PRICE_NOTICE` says
// what it is on every surface that prints a number, and `spread.ts` is what
// turns the point figure into the range that is the actual answer.
//
// These are still not a quote and this file must never grow a comment implying
// they are. They are the price of not making somebody ring a salesman to find
// out whether a pool costs forty thousand dollars or four hundred thousand.

import { PriceCategory, UnitType } from '@prisma/client'
import {
  computeQuote,
  type PriceBookItemLite,
  type ProjectLineItemLite,
  type PricingSelections,
  type QuoteSummary,
} from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'

import { deckMaterialById, finishById } from './catalog'
import type { DreamConfig } from './config'
import { measureDream } from './measure'
import { ballparkSpread } from './spread'

/**
 * The sentence that travels with every number this module produces.
 *
 * One string, for the same reason `PLACEHOLDER_PRICE_NOTICE` is one string: the
 * studio, the share card and anything added later cannot end up describing the
 * same figure in two different ways, one of which sounds like an offer.
 */
export const REFERENCE_PRICE_NOTICE =
  'This is a ballpark built from typical build costs, not a quote. ' +
  'What a pool actually costs depends on your ground, your access and your town, ' +
  'and only a builder who has stood in your yard can tell you the real number.'

/** Shorter, for places a paragraph will not fit. Says the same thing. */
export const REFERENCE_PRICE_NOTICE_SHORT = 'A ballpark, not a quote.'

/**
 * The base rates, before a finish or a deck material moves them.
 *
 * One line per measured quantity, which is a constraint the engine imposes
 * rather than a style choice: `computeQuote` hands a category's measured
 * quantity to every item in that category, so two deck lines in one book would
 * bill the same slab twice, and the engine would suspend both and report a
 * collision the visitor did not cause. Interior finishes and deck materials are
 * therefore multipliers on these lines, applied in `referenceBook()`, not
 * competing lines of their own.
 */
const BASE_LINES: readonly PriceBookItemLite[] = [
  {
    id: 'dream-earthwork',
    category: PriceCategory.EARTHWORK,
    name: 'Excavation and haul-away',
    unitType: UnitType.CUYD,
    retailPrice: 110,
  },
  {
    id: 'dream-shell',
    category: PriceCategory.POOL,
    name: 'Pool shell, steel and interior finish',
    unitType: UnitType.SQFT,
    retailPrice: 118,
    required: true,
  },
  {
    id: 'dream-tile',
    category: PriceCategory.POOL,
    name: 'Waterline tile',
    unitType: UnitType.LF,
    retailPrice: 38,
  },
  {
    id: 'dream-spa',
    category: PriceCategory.SPA,
    name: 'Spa with spillover',
    unitType: UnitType.EACH,
    retailPrice: 12_500,
  },
  {
    id: 'dream-coping',
    category: PriceCategory.COPING,
    name: 'Coping',
    unitType: UnitType.LF,
    retailPrice: 34,
  },
  {
    id: 'dream-bench',
    category: PriceCategory.BENCH,
    name: 'Steps and bench',
    unitType: UnitType.LF,
    retailPrice: 130,
  },
  {
    id: 'dream-deck',
    category: PriceCategory.DECK,
    name: 'Pool deck',
    unitType: UnitType.SQFT,
    retailPrice: 16,
  },
  {
    id: 'dream-drain',
    category: PriceCategory.DRAIN,
    name: 'Deck drainage',
    unitType: UnitType.LF,
    retailPrice: 32,
  },
  {
    id: 'dream-light',
    category: PriceCategory.LIGHTING,
    name: 'LED light',
    unitType: UnitType.EACH,
    retailPrice: 520,
  },
  {
    id: 'dream-water-feature',
    category: PriceCategory.WATER_FEATURE,
    name: 'Water feature',
    unitType: UnitType.EACH,
    retailPrice: 1_900,
  },
  {
    id: 'dream-pump',
    category: PriceCategory.EQUIPMENT,
    name: 'Pump and filtration',
    unitType: UnitType.EACH,
    retailPrice: 4_400,
    required: true,
  },
  {
    id: 'dream-heater',
    category: PriceCategory.EQUIPMENT,
    name: 'Heater',
    unitType: UnitType.EACH,
    retailPrice: 6_200,
    optionKey: 'heater',
  },
  {
    id: 'dream-salt',
    category: PriceCategory.EQUIPMENT,
    name: 'Saltwater system',
    unitType: UnitType.EACH,
    retailPrice: 2_400,
    optionKey: 'salt',
  },
  {
    id: 'dream-screen',
    category: PriceCategory.SCREEN,
    name: 'Screen enclosure',
    unitType: UnitType.LUMP,
    retailPrice: 24_000,
    optionKey: 'screen',
  },
]

/**
 * The work that is on every job and that no drawing measures.
 *
 * These ride as project line items rather than price-book lines because the
 * engine prices `ELECTRICAL` and `MISC` at zero by design: nothing in a drawing
 * measures a sub-panel or a permit fee, so a book line for either bills nothing
 * and the quote correctly reports it as unpriced scope. A homeowner's ballpark
 * that quietly omitted permits and the electrical hook-up would be low by five
 * figures on every pool, which is the one direction a ballpark must not be
 * wrong in.
 */
const SITE_LINES: readonly ProjectLineItemLite[] = [
  {
    id: 'dream-electrical',
    category: PriceCategory.ELECTRICAL,
    name: 'Sub-panel, bonding and hook-up',
    unitType: UnitType.LUMP,
    quantity: 1,
    unitPrice: 3_600,
  },
  {
    id: 'dream-permits',
    category: PriceCategory.MISC,
    name: 'Permits, engineering and inspections',
    unitType: UnitType.LUMP,
    quantity: 1,
    unitPrice: 3_200,
  },
  {
    id: 'dream-startup',
    category: PriceCategory.MISC,
    name: 'Fill, start-up and handover',
    unitType: UnitType.LUMP,
    quantity: 1,
    unitPrice: 1_800,
  },
]

/**
 * The reference list with this design's material choices applied.
 *
 * Pebble interior and travertine decking are not extras bolted onto a base
 * price, they are what the shell and the slab cost when built that way, so they
 * move the rate of the line that already measures them.
 */
export function referenceBook(config: DreamConfig): PriceBookItemLite[] {
  const finishFactor = finishById(config.finish).rateFactor
  const deckFactor = deckMaterialById(config.deckMaterial).rateFactor

  return BASE_LINES.map((line) => {
    if (line.id === 'dream-shell') {
      return { ...line, retailPrice: line.retailPrice * finishFactor }
    }
    if (line.id === 'dream-deck') {
      return { ...line, retailPrice: line.retailPrice * deckFactor }
    }
    return { ...line }
  })
}

/** What the visitor has switched on, in the shape the engine reads. */
export function referenceSelections(config: DreamConfig): PricingSelections {
  return {
    heaterSelected: config.heater,
    saltSystemSelected: config.saltwater,
    screenSelected: config.screenEnclosure,
    projectLineItems: SITE_LINES,
  }
}

/**
 * The answer the studio exists to give.
 *
 * `mid` is what the reference rates add up to. `low` and `high` are that figure
 * widened by everything this page cannot know, and they are the number that
 * gets shown: a single figure would be a more satisfying thing to print and a
 * less true one.
 */
export interface Ballpark {
  readonly low: number
  readonly mid: number
  readonly high: number
  /**
   * `mid` before it was rounded to a figure a person would say out loud.
   *
   * Only for comparing two designs against each other. The studio prices every
   * option twice to show what choosing it would do, and on a $250,000 backyard
   * `mid` is rounded to the nearest thousand, which swallows a $520 light
   * whole and prints "no change" next to a control that does something.
   * Nothing shows this number to anybody.
   */
  readonly exact: number
  /** How wide the range is, as a fraction of `mid`. See `spread.ts`. */
  readonly spread: number
  /** The priced breakdown behind `mid`, for the "where does this go" panel. */
  readonly quote: QuoteSummary
  readonly measurements: MeasurementSummary
}

/** Round to a figure a person would say out loud, never up to a false precision. */
function roundMoney(value: number): number {
  if (value >= 100_000) return Math.round(value / 1_000) * 1_000
  if (value >= 10_000) return Math.round(value / 500) * 500
  return Math.round(value / 100) * 100
}

export function priceDream(config: DreamConfig): Ballpark {
  const measurements = measureDream(config)
  const quote = computeQuote(
    referenceBook(config),
    measurements,
    referenceSelections(config),
    // No sales tax. It is a real cost and it is a different number in every
    // county, and a national ballpark that picked one would be adding a
    // precise-looking error to an approximate figure.
    {},
  )

  const spread = ballparkSpread(config)
  const mid = quote.total

  return {
    low: roundMoney(mid * (1 - spread)),
    mid: roundMoney(mid),
    high: roundMoney(mid * (1 + spread)),
    exact: mid,
    spread,
    quote,
    measurements,
  }
}
