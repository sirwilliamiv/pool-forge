// How the editor dock rolls price-book categories into the five lines a
// salesperson reads.
//
// Kept out of the component so a test can prove the two properties that matter:
// every category the engine can emit lands in exactly one group, and the groups
// therefore sum to the subtotal. The dock used to bucket lines by searching the
// line's `source` text for words like "pump" and "coping", which filed a $1,750
// pump under "Pool shell & finish" and then printed "Equipment $0" beneath it.

import { PriceCategory } from '@prisma/client'

export interface QuoteGroup {
  label: string
  swatch: string
  categories: PriceCategory[]
}

export const QUOTE_GROUPS: readonly QuoteGroup[] = [
  { label: 'Pool shell & finish', swatch: 'bg-sky-500', categories: [PriceCategory.POOL] },
  { label: 'Spa', swatch: 'bg-orange-400', categories: [PriceCategory.SPA] },
  {
    label: 'Equipment',
    swatch: 'bg-violet-500',
    categories: [PriceCategory.EQUIPMENT, PriceCategory.ELECTRICAL],
  },
  {
    label: 'Deck & coping',
    swatch: 'bg-emerald-500',
    categories: [
      PriceCategory.DECK,
      PriceCategory.COPING,
      PriceCategory.LANAI,
      PriceCategory.DRAIN,
      PriceCategory.BENCH,
    ],
  },
  {
    label: 'Lighting & features',
    swatch: 'bg-pink-500',
    categories: [PriceCategory.LIGHTING, PriceCategory.WATER_FEATURE],
  },
  {
    label: 'Site & enclosure',
    swatch: 'bg-amber-500',
    categories: [
      PriceCategory.EARTHWORK,
      PriceCategory.SCREEN,
      PriceCategory.FENCE,
      PriceCategory.WALL,
      PriceCategory.MISC,
    ],
  },
]

/** Group totals for a quote, in display order. Rounded to the cent. */
export function groupTotals(
  lineItems: ReadonlyArray<{ category: PriceCategory; total: number }>,
): Array<{ label: string; swatch: string; total: number }> {
  return QUOTE_GROUPS.map((group) => ({
    label: group.label,
    swatch: group.swatch,
    total:
      Math.round(
        lineItems
          .filter((l) => group.categories.includes(l.category))
          .reduce((sum, l) => sum + l.total, 0) * 100,
      ) / 100,
  }))
}
