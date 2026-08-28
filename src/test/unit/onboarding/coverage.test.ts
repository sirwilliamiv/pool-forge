// The coverage panel is only worth having if it is right.
//
// It makes two claims: "you can draw this" and "your book can price it". The
// first comes from the same stencil mapping the quote engine consults. The
// second is a table in `coverage.ts` that mirrors `quantityForItem`, and a
// mirror is a duplication, so the drift test below drives the real engine for
// every category and unit in existence and checks the table against what it
// actually bills.

import { describe, expect, it } from 'vitest'
import { PriceCategory, UnitType } from '@prisma/client'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import {
  BILLABLE_UNITS,
  coverageGaps,
  priceBookCoverage,
} from '@/modules/onboarding/coverage'
import { STENCILS } from '@/modules/editor/stencils'
import { quoteCategoryForStencil } from '@/modules/editor/stencils/quote-category'
import { STARTER_PRICE_LINES } from '@/modules/onboarding/starter-price-book'

/** Everything measured at once, so nothing is zero for an accidental reason. */
const EVERYTHING: MeasurementSummary = {
  poolSurfaceArea: 400,
  poolPerimeter: 82,
  poolGallons: 16000,
  poolWettedArea: 520,
  poolLengthFt: 25,
  poolWidthFt: 16,
  poolDepthShallow: 3,
  poolDepthDeep: 6,
  poolAvgDepth: 4.5,
  deckArea: 770,
  copingLinearFeet: 82,
  decoDrainLinearFeet: 40,
  benchLinearFeet: 12,
  featureCount: 3,
  spaCount: 1,
  lightCount: 2,
  waterFeatureCount: 2,
  hasPool: true,
  hasDeck: true,
  cutYards: 60,
  fillYards: 20,
  maxSlopePct: 4,
}

const ALL_SELECTED = {
  heaterSelected: true,
  saltSystemSelected: true,
  screenSelected: true,
  lightingQuantity: 4,
}

function probe(category: PriceCategory, unitType: UnitType): PriceBookItemLite {
  return {
    id: 'probe',
    category,
    name: 'Probe line',
    unitType,
    retailPrice: 100,
    required: false,
    optionKey: null,
  }
}

describe('the billable-unit table matches the quote engine', () => {
  for (const category of Object.values(PriceCategory)) {
    for (const unitType of Object.values(UnitType)) {
      it(`${category} sold per ${unitType}`, () => {
        const quote = computeQuote([probe(category, unitType)], EVERYTHING, ALL_SELECTED)
        const billed = quote.lineItems.some((line) => line.itemId === 'probe')
        expect(
          billed,
          billed
            ? `the engine bills ${category}/${unitType} and BILLABLE_UNITS says it cannot`
            : `BILLABLE_UNITS says ${category}/${unitType} bills and the engine gives it nothing`,
        ).toBe(BILLABLE_UNITS[category].has(unitType))
      })
    }
  }
})

describe('coverage of an empty book', () => {
  const rows = priceBookCoverage([])

  it('has a row for every category a drawing tool can produce', () => {
    // Walked over the stencil catalogue here rather than asking the module for
    // its own answer: comparing `drawableCategories()` against itself would
    // pass however wrong that function became.
    const expected = new Set<PriceCategory>()
    for (const stencil of STENCILS) {
      const category = quoteCategoryForStencil(stencil)
      if (category !== null) expected.add(category)
    }
    expect(rows.map((row) => row.category).sort()).toEqual([...expected].sort())
  })

  it('calls every one of them a hole', () => {
    expect(rows.every((row) => row.status === 'MISSING')).toBe(true)
    expect(coverageGaps(rows)).toHaveLength(rows.length)
  })

  it('says how many drawing tools each hole costs', () => {
    for (const row of rows) expect(row.toolCount).toBeGreaterThan(0)
  })

  it('never prints a raw enum at a person', () => {
    for (const row of rows) {
      expect(row.label).not.toMatch(/^[A-Z_]+$/)
      expect(row.detail).not.toContain('WATER_FEATURE')
    }
  })
})

describe('coverage of the starter book', () => {
  const rows = priceBookCoverage(STARTER_PRICE_LINES)

  it('reports no holes at all', () => {
    expect(
      coverageGaps(rows).map((row) => row.label),
      'a new organisation would be told its own starter book cannot price something',
    ).toEqual([])
  })

  it('still says which categories are billed on the job rather than measured', () => {
    const perJob = rows.filter((row) => row.status === 'PER_JOB').map((row) => row.category)
    expect(perJob).toContain(PriceCategory.LANAI)
    expect(perJob).toContain(PriceCategory.FENCE)
    expect(perJob).toContain(PriceCategory.WALL)
  })
})

describe('coverage names the specific hole', () => {
  it('reports a missing water feature line and nothing else', () => {
    const withoutWater = STARTER_PRICE_LINES.filter(
      (line) => line.category !== PriceCategory.WATER_FEATURE,
    )
    const gaps = coverageGaps(priceBookCoverage(withoutWater))
    expect(gaps.map((gap) => gap.category)).toEqual([PriceCategory.WATER_FEATURE])
    expect(gaps[0]?.status).toBe('MISSING')
    expect(gaps[0]?.detail).toMatch(/quote at nothing/i)
  })

  it('reports a line that exists but can never bill', () => {
    // A cage sold by the square foot. The book looks complete and the quote
    // bills nothing, which is the worst of both.
    const bySqft = STARTER_PRICE_LINES.map((line) =>
      line.category === PriceCategory.SCREEN
        ? { category: line.category, unitType: UnitType.SQFT }
        : { category: line.category, unitType: line.unitType },
    )
    const gaps = coverageGaps(priceBookCoverage(bySqft))
    expect(gaps.map((gap) => gap.category)).toEqual([PriceCategory.SCREEN])
    expect(gaps[0]?.status).toBe('UNIT_UNMEASURED')
  })

  it('puts the holes first', () => {
    // Water features, deliberately: "Water features" sorts last alphabetically,
    // so a panel that had quietly gone back to sorting by name would put this
    // row at the bottom and this test would catch it.
    const rows = priceBookCoverage(
      STARTER_PRICE_LINES.filter((line) => line.category !== PriceCategory.WATER_FEATURE),
    )
    expect(rows[0]?.category).toBe(PriceCategory.WATER_FEATURE)
  })
})
