// Two money bugs a reviewer found by driving the real app, stated as tests.
//
// 1. Tick salt, get billed for a heater. Every EQUIPMENT item was gated by one
//    boolean meaning "a heater OR a salt system was chosen", and the engine
//    handed that single answer to every item in the category. A book holding a
//    $5,800 heater and a $2,200 salt cell billed both the moment a customer
//    asked for either. The proposal printed "Heater: not included" over a
//    $5,800 heater line, and the customer paid tax on it.
//
// 2. Five categories accepted money and never billed it. Lanai, fence, wall,
//    electrical and other returned a quantity of zero, `computeQuote` filtered
//    lines at zero, and a builder who entered "Paver retaining wall $9,400"
//    watched it save, saw it in the price book, and never saw it again.
//
// The figures below are the ones the seeded demo actually produced.

import { describe, expect, it } from 'vitest'
import { PriceCategory, ShapeKind, UnitType } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  normalizeOptionKey,
  optionLabel,
  toPriceBookItems,
  toProjectLineItems,
  unitLabel,
  PRICING_OPTIONS,
  type PriceBookItemLite,
  type ProjectLineItemLite,
} from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'

function pool(): Shape {
  return {
    id: 'pool-1',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: 25 * 12,
    height: 12 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 6,
  }
}

const M = computeMeasurements([pool()])

const PUMP: PriceBookItemLite = {
  id: 'pump',
  category: PriceCategory.EQUIPMENT,
  name: 'Variable Speed Pump',
  unitType: UnitType.EACH,
  retailPrice: 1750,
  required: true,
}
const HEATER: PriceBookItemLite = {
  id: 'heater',
  category: PriceCategory.EQUIPMENT,
  name: 'Gas Heater — 400k BTU',
  unitType: UnitType.EACH,
  retailPrice: 5800,
  optionKey: 'heater',
}
const SALT: PriceBookItemLite = {
  id: 'salt',
  category: PriceCategory.EQUIPMENT,
  name: 'Salt Chlorination System',
  unitType: UnitType.EACH,
  retailPrice: 2200,
  optionKey: 'salt',
}

const KEYED_BOOK = [PUMP, HEATER, SALT]
/** The same three lines as the book held before the column existed. */
const LEGACY_BOOK: PriceBookItemLite[] = [
  PUMP,
  { ...HEATER, optionKey: null },
  { ...SALT, optionKey: null },
]

function billed(book: PriceBookItemLite[], sel: Parameters<typeof computeQuote>[2]): string[] {
  return computeQuote(book, M, sel).lineItems.map((l) => l.itemId)
}

describe('an option bills the item that names it, and nothing else', () => {
  it('a customer who asks for salt is not charged for a heater', () => {
    // The reported figure: the demo proposal billed "Gas Heater 400k BTU
    // $5,800" to a job whose own equipment schedule read "Heater: Not
    // included", on top of $348 of sales tax on a heater nobody ordered.
    const quote = computeQuote(KEYED_BOOK, M, { saltSystemSelected: true })
    expect(quote.lineItems.map((l) => l.itemId).sort()).toEqual(['pump', 'salt'])
    expect(quote.lineItems.find((l) => l.itemId === 'heater')).toBeUndefined()
  })

  it('a customer who asks for a heater is not charged for a salt cell', () => {
    expect(billed(KEYED_BOOK, { heaterSelected: true }).sort()).toEqual(['heater', 'pump'])
  })

  it('a customer who asks for both is charged for both', () => {
    expect(
      billed(KEYED_BOOK, { heaterSelected: true, saltSystemSelected: true }).sort(),
    ).toEqual(['heater', 'pump', 'salt'])
  })

  it('a customer who asks for neither is charged for neither', () => {
    expect(billed(KEYED_BOOK, {})).toEqual(['pump'])
  })

  it('says a line is off because the option was not chosen, in words', () => {
    const quote = computeQuote(KEYED_BOOK, M, { saltSystemSelected: true })
    // Filtered out of `lineItems`, so this reads the reason off the engine's
    // own vocabulary rather than the printed sheet.
    expect(optionLabel('heater')).toBe('Heater')
    expect(quote.unpriced.every((u) => !/heater/i.test(u.label))).toBe(true)
  })

  it('an option key beats the required flag', () => {
    // "Required" means "the default when this applies". A heater the customer
    // did not ask for does not apply, however the book has it flagged.
    const book = [{ ...HEATER, required: true }]
    expect(computeQuote(book, M, {}).lineItems).toEqual([])
    expect(computeQuote(book, M, { heaterSelected: true }).lineItems).toHaveLength(1)
  })
})

describe('a book nobody has keyed yet behaves exactly as it did', () => {
  it('still bills every equipment line on either option', () => {
    // Not a regression to preserve for its own sake: an existing book has no
    // option keys, and silently changing what it charges would be its own money
    // bug. Null means "billed by its category rule", and it still is.
    expect(billed(LEGACY_BOOK, { saltSystemSelected: true }).sort()).toEqual([
      'heater',
      'pump',
      'salt',
    ])
  })

  it('and nothing at all when neither option is chosen', () => {
    expect(billed(LEGACY_BOOK, {})).toEqual(['pump'])
  })
})

describe('an option nothing in the book bills is named', () => {
  it('reports salt when the book keys its equipment but has no salt line', () => {
    const quote = computeQuote([PUMP, HEATER], M, { saltSystemSelected: true })
    const told = quote.unpriced.find((u) => u.label === 'Salt system')
    expect(told).toBeDefined()
    expect(told?.scope).toBe('detail')
    expect(told?.reason).toContain('nothing is charged for it')
    // And it says so while the pump is billing perfectly well beside it, which
    // is why this is reported per option rather than per category.
    expect(quote.lineItems.map((l) => l.itemId)).toContain('pump')
  })

  it('says nothing when the option is billed', () => {
    const quote = computeQuote(KEYED_BOOK, M, { saltSystemSelected: true })
    expect(quote.unpriced.some((u) => u.label === 'Salt system')).toBe(false)
  })

  it('names a line keyed to an option the app never asks about', () => {
    const stray: PriceBookItemLite = { ...HEATER, id: 'stray', optionKey: 'ozone' }
    const quote = computeQuote([PUMP, stray], M, { heaterSelected: true })
    expect(quote.lineItems.find((l) => l.itemId === 'stray')).toBeUndefined()
    const told = quote.unpriced.find((u) => u.label === stray.name)
    expect(told?.reason).toContain('does not ask the customer about')
  })
})

describe('option keys are read the way a person writes them', () => {
  it('accepts the spellings an import plausibly carries', () => {
    expect(normalizeOptionKey('Salt System')).toBe('salt')
    expect(normalizeOptionKey('salt_cell')).toBe('salt')
    expect(normalizeOptionKey('HEATER')).toBe('heater')
    expect(normalizeOptionKey('cage')).toBe('screen')
  })

  it('refuses to guess at anything else', () => {
    expect(normalizeOptionKey('ozone')).toBeNull()
    expect(normalizeOptionKey('')).toBeNull()
    expect(normalizeOptionKey(null)).toBeNull()
  })

  it('gives every option a readable label and every unit a readable name', () => {
    for (const key of PRICING_OPTIONS) {
      expect(optionLabel(key)).toBeTruthy()
      expect(optionLabel(key)).not.toBe(key.toUpperCase())
    }
    // Not every unit needs translating — LF is what a builder writes — but the
    // shouted enum names do, and every one has to have an answer.
    for (const unit of Object.values(UnitType)) {
      expect(unitLabel(unit)).toBeTruthy()
    }
    expect(unitLabel(UnitType.SQFT)).toBe('sq ft')
    expect(unitLabel(UnitType.CUYD)).toBe('cu yd')
    expect(unitLabel(UnitType.LUMP)).toBe('lump sum')
  })

  it('carries the key off a Prisma row into the engine', () => {
    const [item] = toPriceBookItems([
      {
        id: 'x',
        category: PriceCategory.EQUIPMENT,
        name: 'Heater',
        unitType: UnitType.EACH,
        retailPrice: '5800.00',
        optionKey: 'heater',
      },
    ])
    expect(item?.optionKey).toBe('heater')
    expect(item?.retailPrice).toBe(5800)
  })
})

// ---------------------------------------------------------------------------

const WALL: ProjectLineItemLite = {
  id: 'line-wall',
  category: PriceCategory.WALL,
  name: 'Paver retaining wall',
  unitType: UnitType.LUMP,
  quantity: 1,
  unitPrice: 9400,
}
const PERMITS: ProjectLineItemLite = {
  id: 'line-permits',
  category: PriceCategory.MISC,
  name: 'Permit fees',
  unitType: UnitType.LUMP,
  quantity: 1,
  unitPrice: 2000,
}

describe('money put on a job by hand is billed', () => {
  it('a $9,400 wall reaches the quote', () => {
    // The reported defect: entered, saved, listed in the price book, and absent
    // from every quote and every document.
    const before = computeQuote(KEYED_BOOK, M, {})
    const after = computeQuote(KEYED_BOOK, M, { projectLineItems: [WALL] })
    const line = after.lineItems.find((l) => l.itemId === 'line-wall')
    expect(line?.name).toBe('Paver retaining wall')
    expect(line?.total).toBe(9400)
    expect(after.subtotal - before.subtotal).toBeCloseTo(9400, 2)
  })

  it('and is taxed like everything else', () => {
    const quote = computeQuote(KEYED_BOOK, M, { projectLineItems: [WALL] }, { taxRatePct: 6 })
    expect(quote.taxAmount).toBeCloseTo(Math.round(quote.subtotal * 0.06 * 100) / 100, 2)
    expect(quote.total).toBeCloseTo(quote.subtotal + quote.taxAmount, 2)
  })

  it('bills all five of the categories that could not bill before', () => {
    const categories = [
      PriceCategory.LANAI,
      PriceCategory.FENCE,
      PriceCategory.WALL,
      PriceCategory.ELECTRICAL,
      PriceCategory.MISC,
    ]
    const added: ProjectLineItemLite[] = categories.map((category, i) => ({
      id: `line-${i}`,
      category,
      name: `${category} work`,
      unitType: UnitType.LUMP,
      quantity: 1,
      unitPrice: 1000,
    }))
    const quote = computeQuote(KEYED_BOOK, M, { projectLineItems: added })
    for (const category of categories) {
      expect(
        quote.lineItems.some((l) => l.category === category),
        `${category} did not reach the quote`,
      ).toBe(true)
    }
  })

  it('quantity times price is what the line charges', () => {
    const fence: ProjectLineItemLite = {
      id: 'line-fence',
      category: PriceCategory.FENCE,
      name: 'Aluminium child barrier',
      unitType: UnitType.LF,
      quantity: 62.5,
      unitPrice: 42,
    }
    const line = computeQuote(KEYED_BOOK, M, { projectLineItems: [fence] }).lineItems.find(
      (l) => l.itemId === 'line-fence',
    )
    expect(line?.quantity).toBe(62.5)
    expect(line?.total).toBe(2625)
  })

  it('two hand-entered items in one category are two items, not a collision', () => {
    // The alternatives rule exists to stop two price-book lines billing one
    // measurement. Nothing here is measured: the builder said what each one is
    // and how many. Two lanais on one job are two lanais.
    //
    // LANAI on purpose, not WALL: walls are already an additive category, so a
    // pair of them would pass this whether or not hand-entered lines are kept
    // out of the collision pass. LANAI is one of the categories that rule
    // suspends, which is what makes this test able to fail.
    const first: ProjectLineItemLite = {
      id: 'line-lanai-1',
      category: PriceCategory.LANAI,
      name: 'Lanai slab extension',
      unitType: UnitType.LUMP,
      quantity: 1,
      unitPrice: 9400,
    }
    const second: ProjectLineItemLite = { ...first, id: 'line-lanai-2', name: 'Lanai screen kick plate', unitPrice: 3100 }
    const quote = computeQuote(KEYED_BOOK, M, { projectLineItems: [first, second] })
    const lanai = quote.lineItems.filter((l) => l.category === PriceCategory.LANAI)
    expect(lanai).toHaveLength(2)
    expect(lanai.reduce((s, l) => s + l.total, 0)).toBe(12500)
  })

  it('a line added at zero is named rather than dropped', () => {
    // The failure mode this whole model exists to end: something entered and
    // never seen again. A zero here is refused at the command boundary; if one
    // ever reaches the engine it is reported, not swallowed.
    const empty: ProjectLineItemLite = { ...PERMITS, quantity: 0 }
    const quote = computeQuote(KEYED_BOOK, M, { projectLineItems: [empty] })
    expect(quote.lineItems.find((l) => l.itemId === empty.id)).toBeUndefined()
    const told = quote.unpriced.find((u) => u.label === 'Permit fees')
    expect(told?.reason).toContain('quantity of zero')
  })

  it('carries a Prisma row into the engine, Decimals and all', () => {
    const [item] = toProjectLineItems([
      {
        id: 'row-1',
        category: PriceCategory.WALL,
        name: 'Paver retaining wall',
        unitType: UnitType.LUMP,
        quantity: '1.000',
        unitPrice: '9400.0000',
        note: null,
      },
    ])
    expect(item?.quantity).toBe(1)
    expect(item?.unitPrice).toBe(9400)
  })
})

describe('a hand-entered amount is scope, drawn or not', () => {
  it('an empty canvas with a permit fee on it is priced, not blank', () => {
    const quote = computeQuote(KEYED_BOOK, computeMeasurements([]), {
      projectLineItems: [PERMITS],
    })
    expect(quote.status).toBe('PRICED')
    expect(quote.total).toBe(2000)
    // The required pump is still not forced onto a job with no design in it.
    expect(quote.lineItems.find((l) => l.itemId === 'pump')).toBeUndefined()
  })

  it('an empty canvas with nothing on it is still blank', () => {
    const quote = computeQuote(KEYED_BOOK, computeMeasurements([]), {})
    expect(quote.status).toBe('NOTHING_DRAWN')
    expect(quote.total).toBe(0)
  })

  it('a job with no price book but a hand-entered wall is priced from that wall', () => {
    const quote = computeQuote([], M, { projectLineItems: [WALL] })
    expect(quote.status).toBe('PRICED')
    expect(quote.subtotal).toBe(9400)
    // And the pool it cannot price is still named rather than billed at zero.
    expect(quote.unpriced.some((u) => u.category === PriceCategory.POOL)).toBe(true)
  })

  it('a job with neither is still reported as unpriceable', () => {
    expect(computeQuote([], M, {}).status).toBe('NO_PRICE_BOOK')
  })
})
