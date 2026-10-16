// How the Stencils panel names and orders its groups. Shared by the built-in
// catalogue and the builder's own library so the two read as one list.

import { StencilCategory } from './types'

export const CATEGORY_LABEL: Record<StencilCategory, string> = {
  [StencilCategory.POOL_SHAPE]: 'Pool shapes',
  [StencilCategory.INTERIOR_FEATURE]: 'Steps & shelves',
  [StencilCategory.WATER_OUTDOOR]: 'Water & outdoor',
  [StencilCategory.DECK_HOUSE]: 'Site & deck',
  [StencilCategory.CONSTRUCTION_SYMBOL]: 'Construction symbols',
}

export const CATEGORY_ORDER: StencilCategory[] = [
  StencilCategory.POOL_SHAPE,
  StencilCategory.INTERIOR_FEATURE,
  StencilCategory.WATER_OUTDOOR,
  StencilCategory.DECK_HOUSE,
  StencilCategory.CONSTRUCTION_SYMBOL,
]
