// Which price-book category a placed stencil sells against.
//
// The catalog says how a stencil *measures* (`measurementBehavior`) and how it
// *prices* (`pricingBehavior`), but nothing said which `PriceCategory` on the
// price book it consumes. Without that link a light placed on the canvas could
// not find the "LED Pool Light" row, so lighting priced at zero unless someone
// separately typed a quantity into the project form.
//
// The mapping is derived from `pricingBehavior` wherever that is unambiguous.
// The feature behaviours are not: a light, a waterfall and an umbrella hole
// all price as "a feature", so those are resolved by catalog id / category.

import { PriceCategory } from '@prisma/client'
import { PricingBehavior, StencilCategory, type Stencil } from './types'

/** Stencils that are lighting fixtures, wherever they sit in the catalog. */
const LIGHT_STENCIL_IDS: ReadonlySet<string> = new Set(['feature.light'])

/**
 * Interior stencils that are water features. The `WATER_OUTDOOR` category is
 * already water/fire by definition; these live under `INTERIOR_FEATURE`.
 */
const WATER_FEATURE_STENCIL_IDS: ReadonlySet<string> = new Set([
  'feature.bubblers',
  'feature.deck-jets',
])

/**
 * The price-book category this stencil bills against, or null when the stencil
 * is drawing furniture (trees, dimension lines, title blocks) that no line item
 * should ever be raised for.
 */
export function quoteCategoryForStencil(def: Stencil): PriceCategory | null {
  switch (def.pricingBehavior) {
    case PricingBehavior.POOL_BASE:
      return PriceCategory.POOL
    case PricingBehavior.SPA_BASE:
      return PriceCategory.SPA
    case PricingBehavior.DECK_PER_SQFT:
      return PriceCategory.DECK
    case PricingBehavior.LANAI_PER_SQFT:
      return PriceCategory.LANAI
    case PricingBehavior.COPING_PER_LF:
      return PriceCategory.COPING
    case PricingBehavior.DECO_DRAIN_PER_LF:
      return PriceCategory.DRAIN
    case PricingBehavior.BENCH_PER_LF:
      return PriceCategory.BENCH
    case PricingBehavior.SCREEN_PER_SQFT:
      return PriceCategory.SCREEN
    case PricingBehavior.FENCE_PER_LF:
      return PriceCategory.FENCE
    case PricingBehavior.WALL_PER_LF:
      return PriceCategory.WALL
    case PricingBehavior.FEATURE_FIXED:
    case PricingBehavior.FEATURE_PER_UNIT: {
      if (LIGHT_STENCIL_IDS.has(def.id)) return PriceCategory.LIGHTING
      if (
        def.category === StencilCategory.WATER_OUTDOOR ||
        WATER_FEATURE_STENCIL_IDS.has(def.id)
      ) {
        return PriceCategory.WATER_FEATURE
      }
      return null
    }
    case PricingBehavior.NONE:
      return null
  }
}
