// The price book a brand new organisation is born with.
//
// Registration used to create a user, an organisation and a membership and
// stop. The first thing a builder did after signing up was draw a pool, and the
// quote said "this drawing cannot be priced" because there was no price book
// behind it. An organisation in the dev database has zero price books and
// twenty one projects, every one of which quoted at $0 until the quote engine
// started saying so out loud.
//
// So a new organisation gets a real list. Two rules govern what is in it:
//
//   1. No holes. Every category a drawing tool can produce has a line here, so
//      a stencil a builder can place is a stencil the quote can price.
//      `coverage.ts` derives the required set from
//      `editor/stencils/quote-category.ts`, and a test fails if a stencil ever
//      lands without a starter line behind it.
//
//   2. One line per measurement. `computeQuote` hands a category's measured
//      quantity to every item in that category, so two items measured the same
//      way bill the same ground twice. The engine catches that and suspends
//      both, which would mean a new organisation's first quote reporting a
//      collision it did not create. Every non-additive category therefore has
//      exactly one line per unit here. A builder adding their second deck
//      finish is making a choice; being handed one on day one is not.
//
// The numbers are placeholders. They are not a recommendation, they are not
// market research, and they are not advice about what anybody should charge.
// `PLACEHOLDER_PRICE_NOTICE` says so on the price book page, the setup
// checklist counts how many are still untouched, and
// `unchangedStarterLines()` is what both of those read.

import { PriceCategory, UnitType } from '@prisma/client'

/**
 * The name of the price book lineage.
 *
 * `createBookVersion` and `getOrCreateActiveBookId` both look for a book called
 * exactly this, so the starter book has to carry the name or a builder's first
 * "new version" would fork a second lineage and deactivate everything they had.
 * The starter book is version 1 of the same line every later version continues.
 */
export const STARTER_PRICE_BOOK_NAME = 'Default'

/** Starter content is version 1. Everything after it is a copy forward. */
export const STARTER_PRICE_BOOK_VERSION = 1

/** The customer selections a starter line may be gated on. */
export type StarterOptionKey = 'heater' | 'salt' | 'screen'

export interface StarterPriceLine {
  category: PriceCategory
  name: string
  unitType: UnitType
  /** What the builder pays. A placeholder, like every number here. */
  unitCost: number
  /** What the customer is charged. A placeholder, like every number here. */
  retailPrice: number
  /**
   * The named default for its category, so a builder who later adds a
   * competing line gets "alternative not selected" rather than a collision.
   */
  required?: boolean
  /** Which customer selection switches this line on. */
  optionKey?: StarterOptionKey
}

/**
 * What a new organisation can price on day one.
 *
 * Ordered by the sequence a pool is actually built in rather than
 * alphabetically, because this list is also read by a person deciding which
 * number to change first.
 */
export const STARTER_PRICE_LINES: readonly StarterPriceLine[] = [
  // Earthwork is sold as one item rather than as a cut rate and a fill rate.
  // The engine reads cut against fill from the item's *name*, but its
  // collision pass groups by category and unit, so a book holding both a cut
  // line and a fill line suspends both the moment a site needs both. A lump
  // sum bills on any graded site and collides with nothing; a builder who
  // wants yardage rates can replace it and price one direction at a time.
  {
    category: PriceCategory.EARTHWORK,
    name: 'Excavation and rough grading',
    unitType: UnitType.LUMP,
    unitCost: 3200,
    retailPrice: 6500,
  },
  // The shell, measured by the water it holds. Marked required so it is the
  // named default of the POOL / per square foot group: the day a builder adds
  // a second shell line, this one wins and the new one reads "alternative not
  // selected" instead of both going silent.
  {
    category: PriceCategory.POOL,
    name: 'Pool shell: gunite, steel and interior finish',
    unitType: UnitType.SQFT,
    unitCost: 42,
    retailPrice: 95,
    required: true,
  },
  // Sold by the foot, and the foot is the pool's own edge. Same category as
  // the shell, different unit, so the two never compete for one measurement.
  {
    category: PriceCategory.POOL,
    name: 'Waterline tile',
    unitType: UnitType.LF,
    unitCost: 15,
    retailPrice: 32,
  },
  {
    category: PriceCategory.SPA,
    name: 'Spa: raised, with spillover',
    unitType: UnitType.EACH,
    unitCost: 4200,
    retailPrice: 8500,
  },
  {
    category: PriceCategory.COPING,
    name: 'Coping: cast concrete, cantilever',
    unitType: UnitType.LF,
    unitCost: 12,
    retailPrice: 26,
  },
  {
    category: PriceCategory.BENCH,
    name: 'Bench and swim-out',
    unitType: UnitType.LF,
    unitCost: 55,
    retailPrice: 120,
  },
  {
    category: PriceCategory.DECK,
    name: 'Concrete deck: broom finish',
    unitType: UnitType.SQFT,
    unitCost: 6.5,
    retailPrice: 14,
  },
  {
    category: PriceCategory.DRAIN,
    name: 'Deco drain',
    unitType: UnitType.LF,
    unitCost: 14,
    retailPrice: 30,
  },
  // Priced per placed fixture, which is what the drawing counts.
  {
    category: PriceCategory.LIGHTING,
    name: 'LED pool light',
    unitType: UnitType.EACH,
    unitCost: 180,
    retailPrice: 450,
  },
  // Per placed feature. A bowl, a sheer descent and a spillway are not the
  // same money, and a builder who sells all three will split this line; one
  // line that bills is a better starting point than three that collide.
  {
    category: PriceCategory.WATER_FEATURE,
    name: 'Water feature: bowl, sheer descent or spillway',
    unitType: UnitType.EACH,
    unitCost: 700,
    retailPrice: 1600,
  },
  // Equipment is additive: a pump, a heater and a salt cell are three things,
  // not three ways of doing one thing. The pump is required (every pool has
  // one); the other two only bill when the customer asked for them by name.
  {
    category: PriceCategory.EQUIPMENT,
    name: 'Pump: variable speed',
    unitType: UnitType.EACH,
    unitCost: 850,
    retailPrice: 1750,
    required: true,
  },
  {
    category: PriceCategory.EQUIPMENT,
    name: 'Heater: gas, 400k BTU',
    unitType: UnitType.EACH,
    unitCost: 3100,
    retailPrice: 5800,
    optionKey: 'heater',
  },
  {
    category: PriceCategory.EQUIPMENT,
    name: 'Salt chlorination system',
    unitType: UnitType.EACH,
    unitCost: 1100,
    retailPrice: 2200,
    optionKey: 'salt',
  },
  // Sold as one thing, because nothing in a drawing measures a cage. A per
  // square foot cage rate bills nothing and the quote says so, which is worse
  // than a lump sum a builder edits.
  {
    category: PriceCategory.SCREEN,
    name: 'Screen enclosure: mansard cage',
    unitType: UnitType.LUMP,
    unitCost: 11800,
    retailPrice: 21500,
    optionKey: 'screen',
  },
  {
    category: PriceCategory.ELECTRICAL,
    name: 'Sub-panel, bonding and equipment hook-up',
    unitType: UnitType.LUMP,
    unitCost: 1450,
    retailPrice: 2900,
  },
  // The last four are rates rather than scope. Nothing in a drawing measures a
  // lanai, a fence, a wall or a permit fee, so these carry the builder's
  // number and the quantity is said on the job. The price book page and the
  // coverage panel both label them, because "saved it, so it will be billed"
  // is exactly the belief that put permit fees on nobody's invoice.
  {
    category: PriceCategory.LANAI,
    name: 'Lanai and covered patio',
    unitType: UnitType.SQFT,
    unitCost: 22,
    retailPrice: 48,
  },
  {
    category: PriceCategory.FENCE,
    name: 'Safety fence',
    unitType: UnitType.LF,
    unitCost: 18,
    retailPrice: 38,
  },
  {
    category: PriceCategory.WALL,
    name: 'Retaining and raised wall',
    unitType: UnitType.LF,
    unitCost: 48,
    retailPrice: 94,
  },
  {
    category: PriceCategory.MISC,
    name: 'Permit and impact fees',
    unitType: UnitType.LUMP,
    unitCost: 2000,
    retailPrice: 2000,
  },
]

/**
 * What the product says about these numbers, wherever it shows them.
 *
 * One string so the price book page, the setup checklist and anything added
 * later cannot describe the same prices in two different ways, one of which
 * sounds like advice.
 */
export const PLACEHOLDER_PRICE_NOTICE =
  'These are placeholder numbers Pool Forge put in so your first quote adds up. ' +
  'They are not a recommendation and they are not market rates. Replace them with your own before you send a proposal.'

/** A stored price book row, as much of it as the placeholder check reads. */
export interface StoredPriceLine {
  category: PriceCategory
  name: string
  unitType: UnitType
  unitCost: number
  retailPrice: number
}

function isSameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

/**
 * Starter lines still sitting at the number Pool Forge invented.
 *
 * Matched on the category, the unit and both prices, and deliberately not on
 * the name. The question being asked is "is this still our number", and a
 * builder who renamed "Concrete deck: broom finish" to "Deck" has told us
 * nothing about the price. Retyping either price is what takes a line out of
 * the count.
 *
 * This is how the product knows whether to keep saying "these are
 * placeholders": the notice fades as the book becomes the builder's own,
 * rather than being switched off by a flag that says nothing about whether
 * anybody looked at a price.
 */
export function unchangedStarterLines(
  stored: readonly StoredPriceLine[],
): StarterPriceLine[] {
  return STARTER_PRICE_LINES.filter((line) =>
    stored.some(
      (row) =>
        row.category === line.category &&
        row.unitType === line.unitType &&
        isSameMoney(row.unitCost, line.unitCost) &&
        isSameMoney(row.retailPrice, line.retailPrice),
    ),
  )
}
