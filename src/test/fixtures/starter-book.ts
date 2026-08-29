// The starter price book in the shape the quote engine reads.
//
// Shared by the example tests and the property test so both are pricing the
// list a real new organisation is given, rather than a hand-copied version of
// it that drifts the first time a line changes.

import type { PriceBookItemLite } from '@/modules/pricing/engine'
import {
  STARTER_PRICE_LINES,
  type StarterPriceLine,
} from '@/modules/onboarding/starter-price-book'

/** One starter line as a price book row, with the id Prisma would have given it. */
export function starterLineAsItem(line: StarterPriceLine, index: number): PriceBookItemLite {
  return {
    id: `starter-${index}`,
    category: line.category,
    name: line.name,
    unitType: line.unitType,
    retailPrice: line.retailPrice,
    required: line.required ?? false,
    optionKey: line.optionKey ?? null,
  }
}

/** The whole starter book, as a new organisation would have it. */
export function starterBookItems(): PriceBookItemLite[] {
  return STARTER_PRICE_LINES.map(starterLineAsItem)
}
