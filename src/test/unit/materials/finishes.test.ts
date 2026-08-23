import { describe, expect, it } from 'vitest'
import { PriceCategory, ShapeKind, UnitType } from '@prisma/client'

import { computeMeasurements } from '@/modules/measurements/engine'
import {
  buildFinishCatalog,
  defaultOptionFor,
  optionFor,
  optionsForSlot,
  resolveFinishes,
  type MaterialRow,
} from '@/modules/materials/catalog'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import { poolFieldsWithFinishes } from '@/modules/projects/pool-fields'
import type { Shape } from '@/modules/editor/state/shapes'

// The defect this file exists for:
//
//   Select the pool, open INTERIOR FINISH, change "Pool Water" to "Glass Mosaic
//   — Aqua mix", reload. It reverted, and the quote never moved. The picker
//   listed ten materials with prices — `PebbleTec — Cobalt $7.10/sqft`,
//   `Travertine — Ivory $28.00/lf` — none of which existed in the price book,
//   and the pool was billed at `Pool Base — Wetted Area $85.00/sqft` whichever
//   finish was chosen. Two price lists, one of them decorative, and the
//   decorative one was the one the builder read to the customer.
//
// So the claims checked here are: a price shown is a price billed, only the
// chosen finish is billed, a finish with no price-book line says so instead of
// being billed at the default, and a slot's unit is enforced rather than
// converted.

const ITEMS: PriceBookItemLite[] = [
  {
    id: 'pool-base',
    category: PriceCategory.POOL,
    name: 'Pool Base — Wetted Area',
    unitType: UnitType.SQFT,
    retailPrice: 85,
    required: true,
  },
  {
    id: 'finish-plaster',
    category: PriceCategory.POOL,
    name: 'Interior Finish — White Plaster',
    unitType: UnitType.SQFT,
    retailPrice: 9.5,
  },
  {
    id: 'finish-pebble',
    category: PriceCategory.POOL,
    name: 'Interior Finish — PebbleTec Cobalt',
    unitType: UnitType.SQFT,
    retailPrice: 15.75,
  },
  {
    id: 'tile-glass',
    category: PriceCategory.POOL,
    name: 'Waterline Tile — Glass Mosaic Aqua',
    unitType: UnitType.LF,
    retailPrice: 32,
  },
  {
    id: 'coping-ivory',
    category: PriceCategory.COPING,
    name: 'Travertine Coping — Ivory',
    unitType: UnitType.LF,
    retailPrice: 42,
  },
  {
    id: 'coping-cantilever',
    category: PriceCategory.COPING,
    name: 'Cantilever Concrete Coping',
    unitType: UnitType.LF,
    retailPrice: 26,
  },
]

const MATERIALS: MaterialRow[] = [
  {
    id: 'mat-water',
    kind: 'POOL_WATER',
    name: 'Pool Water',
    // No slot: it is the colour the water is drawn in, not a finish.
    fillSpec: { type: 'solid', color: '#7DB9E8' },
  },
  {
    id: 'mat-plaster',
    kind: 'CUSTOM',
    name: 'White Plaster',
    fillSpec: {
      type: 'gradient',
      color: '#F1F5F9',
      slot: 'interior',
      priceItemId: 'finish-plaster',
      isDefault: true,
    },
  },
  {
    id: 'mat-pebble',
    kind: 'CUSTOM',
    name: 'PebbleTec — Cobalt',
    fillSpec: {
      type: 'gradient',
      color: '#1E40AF',
      brand: 'PebbleTec',
      slot: 'interior',
      priceItemId: 'finish-pebble',
      // A legacy row's own price. It must not survive parsing, or the panel
      // starts advertising $7.10/sqft again beside a line that bills $15.75.
      costPerSqft: 7.1,
    },
  },
  {
    id: 'mat-glass-aqua',
    kind: 'CUSTOM',
    name: 'Glass Mosaic — Aqua mix',
    fillSpec: {
      type: 'mosaic',
      color: '#06B6D4',
      slot: 'tileBand',
      priceItemId: 'tile-glass',
      isDefault: true,
    },
  },
  {
    id: 'mat-glass-pearl',
    kind: 'CUSTOM',
    name: 'Glass — Pearl',
    // Deliberately claims nothing.
    fillSpec: { type: 'gradient', color: '#F1F5F9', slot: 'tileBand' },
  },
  {
    id: 'mat-ivory',
    kind: 'COPING',
    name: 'Travertine — Ivory',
    fillSpec: {
      type: 'gradient',
      color: '#FEF3C7',
      slot: 'coping',
      priceItemId: 'coping-ivory',
      isDefault: true,
    },
  },
  {
    id: 'mat-cantilever',
    kind: 'COPING',
    name: 'Cantilever Concrete',
    fillSpec: { type: 'gradient', color: '#E7E5E4', slot: 'coping', priceItemId: 'coping-cantilever' },
  },
  {
    // Claims a per-linear-foot item for a per-square-foot slot. This is the
    // shape of the original bug expressed as data.
    id: 'mat-wrong-unit',
    kind: 'CUSTOM',
    name: 'Mis-filed Tile',
    fillSpec: { type: 'mosaic', color: '#0EA5E9', slot: 'interior', priceItemId: 'tile-glass' },
  },
]

const CATALOG = buildFinishCatalog(MATERIALS, ITEMS)

/** 25' × 12' pool: 300 sq ft of surface, 74 LF of perimeter. */
function pool(materials?: Shape['materials']): Shape {
  const shape: Shape = {
    id: 'p1',
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
    depthDeep: 5,
  }
  if (materials) shape.materials = materials
  return shape
}

function quoteFor(shapes: Shape[]) {
  return computeQuote(ITEMS, computeMeasurements(shapes), {
    finishes: resolveFinishes(shapes, CATALOG),
    finishItemIds: CATALOG.claimedItemIds,
  })
}

function lineTotal(shapes: Shape[], itemId: string): number {
  return quoteFor(shapes).lineItems.find((l) => l.itemId === itemId)?.total ?? 0
}

describe('the finish catalogue is a view of the price book', () => {
  it('offers a slot only the materials that belong to it', () => {
    const interior = optionsForSlot(CATALOG, 'interior').map((o) => o.material.name)
    // "Pool Water" is not a finish and the tile band is billed by the foot.
    expect(interior).not.toContain('Pool Water')
    expect(interior).not.toContain('Glass Mosaic — Aqua mix')
    expect(interior).toContain('White Plaster')
    expect(interior).toContain('PebbleTec — Cobalt')
  })

  it('prices a finish from the price book, never from the material row', () => {
    // The row says $7.10/sqft. The price book bills $15.75/sqft. The panel must
    // show the second one, because the second one is what the customer pays.
    const pebble = optionFor(CATALOG, 'mat-pebble')
    expect(pebble?.price?.retailPrice).toBe(15.75)
    expect(pebble?.price?.label).toBe('$15.75/sqft')
  })

  it('refuses to price a finish whose item is sold in the wrong unit', () => {
    const misfiled = optionFor(CATALOG, 'mat-wrong-unit')
    expect(misfiled?.price).toBeNull()
    expect(misfiled?.unpricedReason).toMatch(/linear foot/)
    expect(misfiled?.unpricedReason).toMatch(/square foot/)
  })

  it('says so when a finish has no price-book line at all', () => {
    const pearl = optionFor(CATALOG, 'mat-glass-pearl')
    expect(pearl?.price).toBeNull()
    expect(pearl?.unpricedReason).toMatch(/Not in your price book/)
  })

  it('defaults a slot to its declared default, not to whatever sorts first', () => {
    expect(defaultOptionFor(CATALOG, 'interior')?.material.name).toBe('White Plaster')
    expect(defaultOptionFor(CATALOG, 'coping')?.material.name).toBe('Travertine — Ivory')
  })
})

describe('resolving what a pool is finished in', () => {
  it('reads the finish off the pool', () => {
    const finishes = resolveFinishes([pool({ interior: 'mat-pebble' })], CATALOG)
    const interior = finishes.find((f) => f.slot === 'interior')
    expect(interior?.materialName).toBe('PebbleTec — Cobalt')
    expect(interior?.priceItemId).toBe('finish-pebble')
  })

  it('falls back to the default when nothing has been chosen', () => {
    const finishes = resolveFinishes([pool()], CATALOG)
    expect(finishes.find((f) => f.slot === 'interior')?.materialName).toBe('White Plaster')
  })

  it('ignores a material recorded in a slot it does not belong to', () => {
    // A drawing saved by the old picker can hold a tile band under `interior`.
    const finishes = resolveFinishes([pool({ interior: 'mat-glass-aqua' })], CATALOG)
    expect(finishes.find((f) => f.slot === 'interior')?.materialName).toBe('White Plaster')
  })

  it('finds nothing to finish when there is no pool', () => {
    expect(resolveFinishes([], CATALOG)).toEqual([])
  })
})

describe('the finish reaches the quote', () => {
  it('bills the chosen interior finish and not the others', () => {
    const plaster = quoteFor([pool({ interior: 'mat-plaster' })])
    const pebble = quoteFor([pool({ interior: 'mat-pebble' })])

    // 300 sq ft at $9.50 and at $15.75.
    expect(plaster.lineItems.find((l) => l.itemId === 'finish-plaster')?.total).toBe(2850)
    expect(plaster.lineItems.find((l) => l.itemId === 'finish-pebble')).toBeUndefined()
    expect(pebble.lineItems.find((l) => l.itemId === 'finish-pebble')?.total).toBe(4725)
    expect(pebble.lineItems.find((l) => l.itemId === 'finish-plaster')).toBeUndefined()

    // The number a builder watches when they change the finish in front of a
    // customer. It used to be identical either way.
    expect(pebble.total - plaster.total).toBeCloseTo(1875, 2)
  })

  it('bills one coping, not every coping in the book', () => {
    const q = quoteFor([pool({ coping: 'mat-cantilever' })])
    expect(lineTotal([pool({ coping: 'mat-cantilever' })], 'coping-cantilever')).toBeGreaterThan(0)
    expect(q.lineItems.find((l) => l.itemId === 'coping-ivory')).toBeUndefined()
  })

  it('measures a per-linear-foot pool line along the pool, not as one job', () => {
    // 74 LF of perimeter at $32. Before this, a POOL item sold by the foot
    // priced at quantity 1, so a $32/lf waterline tile billed $32 for the job.
    expect(lineTotal([pool({ tileBand: 'mat-glass-aqua' })], 'tile-glass')).toBe(74 * 32)
  })

  it('reports a finish it cannot bill rather than billing it at the base rate', () => {
    const q = quoteFor([pool({ tileBand: 'mat-glass-pearl' })])
    const note = q.unpriced.find((u) => u.label.includes('Glass — Pearl'))
    expect(note, 'an unbillable finish must appear on the unpriced list').toBeTruthy()
    expect(note?.reason).toMatch(/no price-book item/)
    expect(q.lineItems.find((l) => l.itemId === 'tile-glass')).toBeUndefined()
  })

  it('leaves a price book with no finishes in it billing exactly as before', () => {
    // Backwards compatibility: an organisation whose materials claim nothing
    // must see the same quote it saw yesterday.
    const bare = buildFinishCatalog([], ITEMS)
    const before = computeQuote(ITEMS, computeMeasurements([pool()]), {})
    const after = computeQuote(ITEMS, computeMeasurements([pool()]), {
      finishes: resolveFinishes([pool()], bare),
      finishItemIds: bare.claimedItemIds,
    })
    expect(after.total).toBe(before.total)
  })
})

describe('the finish reaches the paper', () => {
  it('puts the chosen finish where every export reads it', () => {
    const finishes = resolveFinishes([pool({ interior: 'mat-pebble', coping: 'mat-cantilever' })], CATALOG)
    const pf = poolFieldsWithFinishes({ interiorFinish: '', copingMaterial: '' }, finishes)
    expect(pf.interiorFinish).toBe('PebbleTec — Cobalt')
    expect(pf.copingMaterial).toBe('Cantilever Concrete')
  })

  it('keeps the typed answer when there is nothing drawn to override it', () => {
    const pf = poolFieldsWithFinishes({ interiorFinish: 'Diamond Brite', copingMaterial: 'Bluestone' }, [])
    expect(pf.interiorFinish).toBe('Diamond Brite')
    expect(pf.copingMaterial).toBe('Bluestone')
  })
})
