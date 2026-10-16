import { readFileSync } from 'node:fs'
import { ShapeKind, StencilCategory } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { polygonArea } from '@/lib/geometry/polygon-footprint'
import { flattenMaster } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { previewFromRaw } from '@/modules/imports/visio/pipeline'
import { parseRaw } from '@/modules/imports/visio/raw-parser'
import { scaleRings } from '@/modules/imports/visio/scale'
import { FLATTEN_TOLERANCE_IN, SkipReason, StoredCandidateSchema, VISIO_SCALE_DEFAULT } from '@/modules/imports/visio/types'

const POOL = readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8')
const HOUSE = readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8')

describe('previewFromRaw on Pool.vss', () => {
  const result = previewFromRaw(POOL, { fileName: 'Pool.vss' })

  it('keeps 44 of 50 masters and says why the rest are out', () => {
    expect(result.candidates).toHaveLength(44)
    expect(result.skipped.map(s => [s.name, s.reason])).toEqual(
      expect.arrayContaining([
        ['SOB Text', SkipReason.TEXT_ONLY],
        ['Tan Ledge 8 Font', SkipReason.TEXT_ONLY],
        // Water-depth labels: a text box and nothing else.
        ["3' WD", SkipReason.TEXT_ONLY],
      ]),
    )
    expect(result.candidates.length + result.skipped.length).toBe(50)
  })

  it('every candidate validates against the stored schema', () => {
    for (const c of result.candidates) expect(() => StoredCandidateSchema.parse(c)).not.toThrow()
  })

  it('Standard Rectangle is a 25 by 12 foot polygon pool', () => {
    const rect = result.candidates.find(c => c.name === 'Standard Rectangle')!
    expect(rect.category).toBe(StencilCategory.POOL_SHAPE)
    expect(rect.shapeKind).toBe(ShapeKind.POLYGON_POOL)
    const real = scaleRings(rect.rings, VISIO_SCALE_DEFAULT)
    expect(real.widthIn).toBeCloseTo(300, 3)
    expect(real.heightIn).toBeCloseTo(144, 3)
    expect(real.rings[0]).toHaveLength(4)
  })

  it('Standard Rectangle lands on exact integer corners at 1/8" scale', () => {
    const rect = result.candidates.find(c => c.name === 'Standard Rectangle')!
    const real = scaleRings(rect.rings, VISIO_SCALE_DEFAULT)
    expect(real.widthIn).toBe(300)
    expect(real.heightIn).toBe(144)
    expect(real.rings[0]).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 144 }, { x: 0, y: 144 }]))
  })

  it('reports every skip with its position in the file', () => {
    expect(result.skipped).toHaveLength(6)
    expect(result.skipped.find(s => s.name === 'SOB Text')?.index).toBe(35)
  })

  it('Round Corners is one ring, 27 by 16 feet', () => {
    const rc = result.candidates.find(c => c.name === 'Round Corners')!
    expect(rc.ringCount).toBe(1)
    const real = scaleRings(rc.rings, VISIO_SCALE_DEFAULT)
    expect(real.widthIn).toBeCloseTo(324, 2)
    expect(real.heightIn).toBeCloseTo(192, 2)
  })

  it('the kidney area has converged at the default tolerance', () => {
    const master = parseRaw(POOL).masters.find(m => m.name === 'Freeform Kidney 11')!
    const coarse = polygonArea(outlineOf(flattenMaster(master, FLATTEN_TOLERANCE_IN))!.footprint)
    const fine = polygonArea(outlineOf(flattenMaster(master, FLATTEN_TOLERANCE_IN / 10))!.footprint)
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.01)
  })

  it('keeps the original name and a thumbnail on every candidate', () => {
    const jets = result.candidates.find(c => c.name === 'Deck Jets (5)')!
    expect(jets.thumbnailSvg).toContain('<svg')
    expect(jets.index).toBe(29)
  })
})

describe('previewFromRaw on the House&Deck excerpt', () => {
  const result = previewFromRaw(HOUSE, { fileName: 'House&Deck.vss' })
  it('skips the raster and the dimension line, keeps the rest', () => {
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'R_Concrete', reason: SkipReason.RASTER }),
      expect.objectContaining({ name: 'Dimension Line 0', reason: SkipReason.NO_OUTLINE }),
    ]))
    expect(result.candidates.map(c => c.name)).toEqual(expect.arrayContaining(['House', 'Grass', 'Concrete Lanai', 'Raised Deck']))
    expect(result.candidates.find(c => c.name === 'Grass')?.shapeKind).toBe(ShapeKind.GRASS_AREA)
  })
})
