'use client'

import { create } from 'zustand'
import { EMPTY_FINISH_CATALOG, type FinishCatalog } from '@/modules/materials/catalog'

/**
 * The organisation's finish catalogue, already joined to its price book.
 *
 * Held in a store rather than passed down as props because three unrelated
 * things need it and they must not disagree: the inspector rows a builder
 * picks from, the live quote those picks move, and the command handler that
 * refuses a waterline tile offered as an interior finish. Prop-drilling it to
 * two of the three is how the panel and the quote came to be reading different
 * price lists in the first place.
 */
interface MaterialsState {
  catalog: FinishCatalog
  hydrate: (catalog: FinishCatalog) => void
}

export const useMaterialsStore = create<MaterialsState>((set) => ({
  catalog: EMPTY_FINISH_CATALOG,
  hydrate(catalog) {
    set({ catalog })
  },
}))
