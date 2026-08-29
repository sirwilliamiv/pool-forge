// A stencil you can place and cannot price is the failure this file exists to
// stop.
//
// The quote engine already reports it after the fact, per project, as "drawn
// but not priced". By then a builder has designed a pool and is looking at a
// total that is missing a scope. The starter book is supposed to make that
// impossible on day one, and "supposed to" is worth nothing without a test that
// fails when somebody adds the twenty-second stencil category and no line
// behind it.

import { describe, expect, it } from 'vitest'
import { PriceCategory, UnitType } from '@prisma/client'
import {
  ADDITIVE_CATEGORIES,
  categoryLabel,
  normalizeOptionKey,
} from '@/modules/pricing/engine'
import {
  BILLABLE_UNITS,
  drawableCategories,
  stencilsPerCategory,
} from '@/modules/onboarding/coverage'
import {
  PLACEHOLDER_PRICE_NOTICE,
  STARTER_PRICE_BOOK_NAME,
  STARTER_PRICE_LINES,
  unchangedStarterLines,
  type StoredPriceLine,
} from '@/modules/onboarding/starter-price-book'

const linesFor = (category: PriceCategory) =>
  STARTER_PRICE_LINES.filter((line) => line.category === category)

describe('the starter book has no holes', () => {
  it('has a line for every category a drawing tool can produce', () => {
    const tools = stencilsPerCategory()
    const missing = drawableCategories()
      .filter((category) => linesFor(category).length === 0)
      .map(
        (category) =>
          `${categoryLabel(category)} (${(tools.get(category) ?? []).join(', ')})`,
      )
    expect(
      missing,
      `these stencils can be placed and nothing in the starter book prices them: ${missing.join('; ')}`,
    ).toEqual([])
  })

  it('sells every measurable category in a unit the drawing can measure', () => {
    // A water feature line sold per square foot is a line that never bills:
    // nothing in the drawing knows how big a waterfall is. Having the line and
    // having a line that works are two different claims.
    const unbillable: string[] = []
    for (const category of drawableCategories()) {
      const billable = BILLABLE_UNITS[category]
      if (billable.size === 0) continue // priced on the job, by design
      const lines = linesFor(category)
      if (!lines.some((line) => billable.has(line.unitType))) {
        unbillable.push(categoryLabel(category))
      }
    }
    expect(unbillable).toEqual([])
  })

  it('gives the categories nothing measures a rate anyway', () => {
    // A lanai, a fence and a wall are all drawable and none of them is
    // measured, so their quantity is said on the job. The rate still belongs in
    // the book: a builder asked for a price and being handed a blank is worse
    // than being handed a number to change.
    for (const category of drawableCategories()) {
      if (BILLABLE_UNITS[category].size > 0) continue
      expect(linesFor(category).length, categoryLabel(category)).toBeGreaterThan(0)
    }
  })
})

describe('the starter book does not fight itself', () => {
  it('never puts two lines on one measurement', () => {
    // `computeQuote` hands a category's measured quantity to every item in it,
    // so two items measured the same way bill the same ground twice. The engine
    // catches that and suspends both, which would mean a new organisation's
    // very first quote reporting a collision nobody created. One line per
    // category and unit, unless exactly one of them is the named default.
    const groups = new Map<string, typeof STARTER_PRICE_LINES[number][]>()
    for (const line of STARTER_PRICE_LINES) {
      if (ADDITIVE_CATEGORIES.has(line.category)) continue
      const key = `${line.category}:${line.unitType}`
      const list = groups.get(key) ?? []
      list.push(line)
      groups.set(key, list)
    }
    for (const [key, list] of groups) {
      if (list.length < 2) continue
      const defaults = list.filter((line) => line.required)
      expect(
        defaults.length,
        `${key} holds ${list.length} lines (${list.map((l) => l.name).join(', ')}) and no single default, so both would be suspended`,
      ).toBe(1)
    }
  })

  it('only ever names an option the app actually asks the customer about', () => {
    // Checked through the engine's own normaliser rather than against a copy of
    // the list. A line keyed to something the customer is never asked about is
    // zeroed and reported as "switched on by an option the app does not ask
    // about", which is a line that sits in the book billing nothing.
    for (const line of STARTER_PRICE_LINES) {
      if (line.optionKey === undefined) continue
      expect(normalizeOptionKey(line.optionKey), line.name).toBe(line.optionKey)
    }
  })

  it('is version 1 of the lineage every later version continues', () => {
    // `createBookVersion` copies forward whatever book is called exactly this.
    // A starter book under any other name would be forked away the first time a
    // builder cut a version, and they would lose the list.
    expect(STARTER_PRICE_BOOK_NAME).toBe('Default')
  })
})

describe('the prices announce themselves as placeholders', () => {
  const stored = (): StoredPriceLine[] =>
    STARTER_PRICE_LINES.map((line) => ({
      category: line.category,
      name: line.name,
      unitType: line.unitType,
      unitCost: line.unitCost,
      retailPrice: line.retailPrice,
    }))

  it('counts an untouched book as entirely placeholder', () => {
    expect(unchangedStarterLines(stored())).toHaveLength(STARTER_PRICE_LINES.length)
  })

  it('stops counting a line the builder has repriced', () => {
    const edited = stored()
    const first = edited[0]
    expect(first).toBeDefined()
    if (!first) return
    first.retailPrice = first.retailPrice + 12.5
    expect(unchangedStarterLines(edited)).toHaveLength(STARTER_PRICE_LINES.length - 1)
  })

  it('stops counting a line the builder has recosted, even at the same retail', () => {
    const edited = stored()
    const first = edited[0]
    if (!first) return
    first.unitCost = first.unitCost + 3
    expect(unchangedStarterLines(edited)).toHaveLength(STARTER_PRICE_LINES.length - 1)
  })

  it('counts nothing in a book that is not ours', () => {
    expect(
      unchangedStarterLines([
        {
          category: PriceCategory.POOL,
          name: "Bob's own shell price",
          unitType: UnitType.SQFT,
          unitCost: 40,
          retailPrice: 92,
        },
      ]),
    ).toHaveLength(0)
  })

  it('still counts a line the builder renamed but did not reprice', () => {
    // Renaming a line says nothing about its price, and the question this
    // answers is "is this still our number".
    const renamed = stored().map((line, index) =>
      index === 0 ? { ...line, name: 'Shell' } : line,
    )
    expect(unchangedStarterLines(renamed)).toHaveLength(STARTER_PRICE_LINES.length)
  })

  it('does not mistake one category for another at the same price', () => {
    const shell = STARTER_PRICE_LINES.find((line) => line.category === PriceCategory.POOL)
    expect(shell).toBeDefined()
    if (!shell) return
    expect(
      unchangedStarterLines([
        {
          category: PriceCategory.DECK,
          name: shell.name,
          unitType: shell.unitType,
          unitCost: shell.unitCost,
          retailPrice: shell.retailPrice,
        },
      ]),
    ).toHaveLength(0)
  })

  it('does not mistake one unit for another at the same price', () => {
    const shell = STARTER_PRICE_LINES.find((line) => line.category === PriceCategory.POOL)
    if (!shell) return
    expect(
      unchangedStarterLines([
        {
          category: shell.category,
          name: shell.name,
          unitType: UnitType.LF,
          unitCost: shell.unitCost,
          retailPrice: shell.retailPrice,
        },
      ]),
    ).toHaveLength(0)
  })

  it('says they are not advice, in the product, in one place', () => {
    expect(PLACEHOLDER_PRICE_NOTICE).toMatch(/not a recommendation/i)
    expect(PLACEHOLDER_PRICE_NOTICE).toMatch(/replace them/i)
  })
})
