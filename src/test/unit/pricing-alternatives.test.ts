// Two items in one category, both billing the same square footage.
//
// A builder's price book is the one thing they are asked to spend an afternoon
// setting up, and adding a second deck line to it silently charged the customer
// for the deck twice. The engine prices by category: it asks the category for a
// quantity, hands that quantity to every item in it, and adds up whatever comes
// back. One deck, 770 sq ft, two lines, 1,540 sq ft of concrete on the quote.
//
// Found while seeding a second coping item during unrelated work: the proposal
// quoted two copings around one pool.

import { describe, expect, it } from 'vitest'
import { PriceCategory, ShapeKind, UnitType } from '@prisma/client'

import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'

const POOL: Shape = {
  id: 'pool-1',
  kind: ShapeKind.RECTANGLE_POOL,
  x: 0,
  y: 0,
  width: 300,
  height: 144,
  rotation: 0,
  zIndex: 1,
  locked: false,
  hidden: false,
  depthShallow: 3,
  depthDeep: 5,
}

const DECK: Shape = {
  id: 'deck-1',
  kind: ShapeKind.CONCRETE_DECK,
  x: -60,
  y: -60,
  width: 420,
  height: 264,
  rotation: 0,
  zIndex: 0,
  locked: false,
  hidden: false,
}

const poolBase: PriceBookItemLite = {
  id: 'pool-base',
  category: PriceCategory.POOL,
  name: 'Pool Base — Wetted Area',
  unitType: UnitType.SQFT,
  retailPrice: 85,
  required: true,
}

const concreteDeck: PriceBookItemLite = {
  id: 'deck-concrete',
  category: PriceCategory.DECK,
  name: 'Concrete Deck',
  unitType: UnitType.SQFT,
  retailPrice: 14,
}

const paverDeck: PriceBookItemLite = {
  id: 'deck-paver',
  category: PriceCategory.DECK,
  name: 'Paver Deck',
  unitType: UnitType.SQFT,
  retailPrice: 22,
}

const measurements = computeMeasurements([POOL, DECK])

function deckLines(book: PriceBookItemLite[]) {
  return computeQuote(book, measurements, {}, { taxRatePct: 0 }).lineItems.filter(
    (l) => l.category === PriceCategory.DECK,
  )
}

describe('two items competing for one measurement', () => {
  it('reproduces the setup: one deck, two deck items in the book', () => {
    // Guards the guard. If the fixture stopped producing a deck, every
    // assertion below would pass while measuring nothing.
    expect(measurements.deckArea).toBeGreaterThan(0)
  })

  it('does not bill the same deck twice', () => {
    const lines = deckLines([poolBase, concreteDeck, paverDeck])
    const billedArea = lines.reduce((sum, l) => sum + l.quantity, 0)
    expect(
      billedArea,
      `billed ${billedArea} sq ft of deck for a ${measurements.deckArea} sq ft deck`,
    ).toBeLessThanOrEqual(measurements.deckArea)
  })

  it('says which items competed rather than choosing one quietly', () => {
    const quote = computeQuote([poolBase, concreteDeck, paverDeck], measurements, {}, { taxRatePct: 0 })
    const note = quote.unpriced.find((u) => u.category === PriceCategory.DECK)
    expect(note, 'nothing told the builder their two deck items collided').toBeDefined()
    expect(note?.reason).toMatch(/Concrete Deck/)
    expect(note?.reason).toMatch(/Paver Deck/)
  })

  it('still bills a single item in the category exactly as before', () => {
    const lines = deckLines([poolBase, concreteDeck])
    expect(lines).toHaveLength(1)
    expect(lines[0]?.quantity).toBe(measurements.deckArea)
  })

  it('bills the required one when a book names a default', () => {
    const lines = deckLines([poolBase, { ...concreteDeck, required: true }, paverDeck])
    expect(lines).toHaveLength(1)
    expect(lines[0]?.name).toBe('Concrete Deck')
  })

  it('leaves genuinely additive categories alone', () => {
    // A pump, a heater and a salt cell are three pieces of equipment on one
    // job, not three ways of doing the same thing.
    const equipment: PriceBookItemLite[] = [
      { id: 'pump', category: PriceCategory.EQUIPMENT, name: 'Pump', unitType: UnitType.EACH, retailPrice: 1750, required: true },
      { id: 'heater', category: PriceCategory.EQUIPMENT, name: 'Heater', unitType: UnitType.EACH, retailPrice: 5800 },
      { id: 'salt', category: PriceCategory.EQUIPMENT, name: 'Salt cell', unitType: UnitType.EACH, retailPrice: 2200 },
    ]
    const quote = computeQuote(
      [poolBase, ...equipment],
      measurements,
      { heaterSelected: true, saltSystemSelected: true },
      { taxRatePct: 0 },
    )
    const lines = quote.lineItems.filter((l) => l.category === PriceCategory.EQUIPMENT)
    expect(lines).toHaveLength(3)
  })
})
