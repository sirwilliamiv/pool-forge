import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { polygonBounds, signedDoubleArea } from '@/lib/geometry/polygon-footprint'
import { flattenMaster } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { parseRaw } from '@/modules/imports/visio/raw-parser'

// polygonArea reports square feet; these assertions are in square drawing inches.
const polygonArea = (ring: { x: number; y: number }[]) => Math.abs(signedDoubleArea(ring)) / 2

const doc = parseRaw(readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8'))
const master = (name: string) => doc.masters.find(m => m.name === name)!

describe('outlineOf', () => {
  it('unions five layers into one rounded rectangle', () => {
    const outline = outlineOf(flattenMaster(master('Round Corners')))!
    const b = polygonBounds(outline.footprint)
    expect(b.maxX - b.minX).toBeCloseTo(3.375, 3)
    expect(b.maxY - b.minY).toBeCloseTo(2.0, 3)
    // Bigger than the inner rectangle, smaller than the full box.
    const area = polygonArea(outline.footprint)
    expect(area).toBeGreaterThan(2.875 * 1.5)
    expect(area).toBeLessThan(3.375 * 2.0)
    expect(outline.detail).toHaveLength(0)
  })

  it('keeps the kidney as a single ring with the master colours', () => {
    const outline = outlineOf(flattenMaster(master('Freeform Kidney 11')))!
    expect(outline.footprint.length).toBeGreaterThan(20)
    expect(outline.fill).toMatch(/^#[0-9a-f]{6}$/)
    expect(outline.stroke).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('returns null for a master with nothing closed', () => {
    const house = parseRaw(readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8'))
    const dim = house.masters.find(m => m.name === 'Dimension Line 0')!
    expect(outlineOf(flattenMaster(dim))).toBeNull()
    expect(outlineOf([])).toBeNull()
  })

  it('falls back to closed stroke-only paths when nothing is filled', () => {
    const stroked = flattenMaster(master('Standard Rectangle')).map(p => ({ ...p, style: { ...p.style, fill: false, stroke: true } }))
    const outline = outlineOf(stroked)!
    expect(polygonBounds(outline.footprint).maxX).toBeCloseTo(3.125, 3)
  })

  it('picks the largest polygon as the footprint and keeps the rest as detail', () => {
    // Two separate squares: footprint is the big one, the small one is detail.
    const style = { fill: true, stroke: false, fillColor: '#123456', strokeColor: '#000000' }
    const sq = (x: number, s: number) => ({ points: [{ x, y: 0 }, { x: x + s, y: 0 }, { x: x + s, y: s }, { x, y: s }], closed: true })
    const outline = outlineOf([{ style, subpaths: [sq(0, 2), sq(5, 1)] }])!
    expect(polygonArea(outline.footprint)).toBeCloseTo(4, 6)
    expect(outline.detail).toHaveLength(1)
  })
})
