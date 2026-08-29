// Regression cover for "the price is not believable".
//
// Every case here is a figure a first-time user actually saw on screen and
// could not reconcile: $1,855 for an empty canvas, a breakdown $352 adrift of
// its own headline, "Equipment $0" printed beside a $1,750 pump, a waterfall
// and a light that cost nothing, and a pool that grew 100 sq ft without moving
// the price. The seeded price book is reproduced exactly so the numbers below
// are the numbers the product prints.

import { describe, expect, it } from 'vitest'
import { PriceCategory, ShapeKind, UnitType } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  categoryLabel,
  effectiveLightingQuantity,
  hasBillableScope,
  type PriceBookItemLite,
} from '@/modules/pricing/engine'
import { groupTotals, QUOTE_GROUPS } from '@/components/editor/shell/quote-groups'
import { formatUsd } from '@/lib/money'
import type { Shape } from '@/modules/editor/state/shapes'

/** The seeded "Default Price Book", item for item. */
const SEEDED_BOOK: PriceBookItemLite[] = [
  {
    id: 'pool',
    category: PriceCategory.POOL,
    name: 'Pool Base — Wetted Area',
    unitType: UnitType.SQFT,
    retailPrice: 85,
    required: true,
  },
  {
    id: 'deck',
    category: PriceCategory.DECK,
    name: 'Concrete Deck',
    unitType: UnitType.SQFT,
    retailPrice: 14,
  },
  {
    id: 'coping',
    category: PriceCategory.COPING,
    name: 'Travertine Coping',
    unitType: UnitType.LF,
    retailPrice: 42,
  },
  {
    id: 'equipment',
    category: PriceCategory.EQUIPMENT,
    name: 'Variable Speed Pump',
    unitType: UnitType.EACH,
    retailPrice: 1750,
    required: true,
  },
  {
    id: 'lighting',
    category: PriceCategory.LIGHTING,
    name: 'LED Pool Light',
    unitType: UnitType.EACH,
    retailPrice: 450,
  },
]

const TAX = { taxRatePct: 6 }

function pool(widthFt: number, heightFt: number): Shape {
  return {
    id: 'pool-1',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: widthFt * 12,
    height: heightFt * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 6,
  }
}

function stencil(id: string, stencilId: string, wFt: number, hFt: number): Shape {
  return {
    id,
    kind: ShapeKind.STENCIL,
    stencilId,
    x: 0,
    y: 0,
    width: wFt * 12,
    height: hFt * 12,
    rotation: 0,
    zIndex: 2,
    locked: false,
    hidden: false,
  }
}

const light = (id = 'light-1') => stencil(id, 'feature.light', 0.5, 0.5)
const waterfall = (id = 'wf-1') => stencil(id, 'water.waterfall', 5, 2)

describe('an empty drawing quotes nothing', () => {
  // The headline defect: a brand-new project with zero layers showed
  // "LIVE QUOTE $1,855", which was the required pump ($1,750) plus 6% tax.
  it('quotes no money at all, and says why', () => {
    const quote = computeQuote(SEEDED_BOOK, computeMeasurements([]), {}, TAX)
    expect(quote.status).toBe('NOTHING_DRAWN')
    expect(quote.lineItems).toEqual([])
    expect(quote.subtotal).toBe(0)
    expect(quote.taxAmount).toBe(0)
    expect(quote.total).toBe(0)
  })

  it('does not force the required pump onto a job that does not exist', () => {
    const quote = computeQuote(SEEDED_BOOK, computeMeasurements([]), {}, TAX)
    expect(quote.lineItems.find((l) => l.itemId === 'equipment')).toBeUndefined()
  })

  it('still forces the required pump onto a job that does', () => {
    const quote = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 12)]), {}, TAX)
    expect(quote.lineItems.find((l) => l.itemId === 'equipment')?.total).toBe(1750)
  })

  it('an empty measurement summary has no billable scope', () => {
    expect(hasBillableScope(computeMeasurements([]))).toBe(false)
    expect(hasBillableScope(computeMeasurements([pool(25, 12)]))).toBe(true)
  })
})

describe('a design with no price book behind it is not free', () => {
  // Twenty-one projects in the dev database belong to an organisation with no
  // price book. Every one of them quoted $0, including a 16-shape design.
  it('reports that it cannot be priced instead of quoting zero', () => {
    const quote = computeQuote([], computeMeasurements([pool(25, 16)]), {}, TAX)
    expect(quote.status).toBe('NO_PRICE_BOOK')
    expect(quote.total).toBe(0)
    expect(quote.unpriced.map((u) => u.category)).toContain(PriceCategory.POOL)
  })
})

describe('the parts add up to the total', () => {
  const quote = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 16), light(), waterfall()]), {}, TAX)

  it('the breakdown groups sum to the subtotal', () => {
    // The dock printed groups totalling $39,194 under a headline of $41,546.
    const grouped = groupTotals(quote.lineItems).reduce((sum, g) => sum + g.total, 0)
    expect(grouped).toBeCloseTo(quote.subtotal, 2)
  })

  it('subtotal plus tax equals the total', () => {
    expect(quote.subtotal + quote.taxAmount).toBeCloseTo(quote.total, 2)
  })

  it('files the pump under Equipment and the coping under Deck & coping', () => {
    // Both used to be classified by searching the line's source text, so both
    // landed in "Pool shell & finish" while their own rows printed $0.
    const byLabel = new Map(groupTotals(quote.lineItems).map((g) => [g.label, g.total]))
    expect(byLabel.get('Equipment')).toBe(1750)
    expect(byLabel.get('Deck & coping')).toBeGreaterThan(0)
    expect(byLabel.get('Pool shell & finish')).toBeLessThan(quote.subtotal)
  })

  it('every category the engine can emit belongs to exactly one group', () => {
    for (const category of Object.values(PriceCategory)) {
      const owners = QUOTE_GROUPS.filter((g) => g.categories.includes(category))
      expect(owners).toHaveLength(1)
    }
  })

  it('invents no permits line', () => {
    expect(quote.lineItems.some((l) => /permit/i.test(l.name))).toBe(false)
  })
})

describe('a change to the drawing changes the price', () => {
  it('widening the pool from 12ft to 16ft moves the total', () => {
    // Surface area went 300 -> 400 sq ft and the price did not move, because
    // the dock was rendering a cached quote from the last save.
    const narrow = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 12)]), {}, TAX)
    const wide = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 16)]), {}, TAX)
    expect(computeMeasurements([pool(25, 12)]).poolSurfaceArea).toBe(300)
    expect(computeMeasurements([pool(25, 16)]).poolSurfaceArea).toBe(400)
    expect(wide.total).toBeGreaterThan(narrow.total)
  })

  it('placing a light adds exactly one LED light to the quote', () => {
    const before = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 16)]), {}, TAX)
    const after = computeQuote(
      SEEDED_BOOK,
      computeMeasurements([pool(25, 16), light('l1'), light('l2')]),
      {},
      TAX,
    )
    const line = after.lineItems.find((l) => l.itemId === 'lighting')
    expect(line?.quantity).toBe(2)
    expect(line?.source).toBe('Lights in drawing')
    expect(after.subtotal - before.subtotal).toBeCloseTo(900, 2)
  })

  it('lights in the drawing beat the number typed into the project form', () => {
    const m = computeMeasurements([pool(25, 16), light('l1')])
    expect(effectiveLightingQuantity(m, { lightingQuantity: 7 })).toBe(1)
    expect(effectiveLightingQuantity(computeMeasurements([pool(25, 16)]), { lightingQuantity: 7 })).toBe(7)
  })
})

describe('what cannot be priced is named, not hidden', () => {
  it('a waterfall the price book cannot price is reported, not silently free', () => {
    const quote = computeQuote(
      SEEDED_BOOK,
      computeMeasurements([pool(25, 16), waterfall()]),
      {},
      TAX,
    )
    const entry = quote.unpriced.find((u) => u.category === PriceCategory.WATER_FEATURE)
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Water features')
    expect(entry?.quantity).toBe(1)
    expect(entry?.reason).toContain('price book')
  })

  it('a waterfall the price book does price raises a real line', () => {
    const book: PriceBookItemLite[] = [
      ...SEEDED_BOOK,
      {
        id: 'wf',
        category: PriceCategory.WATER_FEATURE,
        name: 'Sheer descent waterfall',
        unitType: UnitType.EACH,
        retailPrice: 2400,
      },
    ]
    const quote = computeQuote(book, computeMeasurements([pool(25, 16), waterfall()]), {}, TAX)
    expect(quote.lineItems.find((l) => l.itemId === 'wf')?.total).toBe(2400)
    expect(quote.unpriced.some((u) => u.category === PriceCategory.WATER_FEATURE)).toBe(false)
  })

  it('never reports scope as unpriced when a line for it exists', () => {
    const quote = computeQuote(SEEDED_BOOK, computeMeasurements([pool(25, 16), light()]), {}, TAX)
    expect(quote.unpriced.some((u) => u.category === PriceCategory.LIGHTING)).toBe(false)
    expect(quote.unpriced.some((u) => u.category === PriceCategory.POOL)).toBe(false)
  })
})

describe('no raw enum reaches a customer', () => {
  it('every price category has a readable label', () => {
    for (const category of Object.values(PriceCategory)) {
      const label = categoryLabel(category)
      expect(label).toBeTruthy()
      expect(label).not.toBe(category)
      expect(label).not.toMatch(/_/)
    }
  })
})

describe('one money format everywhere', () => {
  it('rounds to whole dollars, so the packet cannot print cents the proposal hides', () => {
    // Editor said $41,546, proposal said $41,546, packet said $41,545.64.
    expect(formatUsd(41545.64)).toBe('$41,546')
    expect(formatUsd(41545.64)).toBe(formatUsd(41546))
  })
})
