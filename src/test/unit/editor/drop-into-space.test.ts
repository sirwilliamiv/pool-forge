import { describe, expect, it } from 'vitest'

import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { fitIntoSpace, spaceName, spaceUnder } from '@/modules/editor/interactions/drag'

function sketch(overrides: Partial<Shape> & { id: string }): Shape {
  return {
    kind: ShapeKind.SKETCH_PATH,
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    zIndex: 0,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
    ...overrides,
  } as Shape
}

describe('spaceUnder', () => {
  it('finds the closed outline a point falls in', () => {
    const found = spaceUnder({ x: 60, y: 60 }, [sketch({ id: 'lanai' })])
    expect(found?.id).toBe('lanai')
  })

  it('ignores an open path, which has no inside to drop into', () => {
    expect(spaceUnder({ x: 60, y: 60 }, [sketch({ id: 'line', closed: false })])).toBeNull()
  })

  it('ignores a hidden outline', () => {
    expect(spaceUnder({ x: 60, y: 60 }, [sketch({ id: 'lanai', hidden: true })])).toBeNull()
  })

  it('never treats the dragged shape as its own destination', () => {
    expect(spaceUnder({ x: 60, y: 60 }, [sketch({ id: 'self' })], 'self')).toBeNull()
  })

  // Nesting is normal on a pool plan: a lanai inside a lot boundary. Picking
  // the outer ring would put every dropped object in the lot and make the
  // feature useless on any real drawing.
  it('picks the smallest containing outline when they nest', () => {
    const lot = sketch({
      id: 'lot',
      width: 600,
      height: 600,
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 600 },
        { x: 0, y: 600 },
      ],
    })
    const lanai = sketch({ id: 'lanai', x: 40, y: 40 })
    expect(spaceUnder({ x: 80, y: 80 }, [lot, lanai])?.id).toBe('lanai')
  })

  it('returns nothing for a point outside every outline', () => {
    expect(spaceUnder({ x: 500, y: 500 }, [sketch({ id: 'lanai' })])).toBeNull()
  })
})

describe('fitIntoSpace', () => {
  it('moves an object that overhangs the edge back inside', () => {
    const result = fitIntoSpace({ x: 110, y: 50, width: 40, height: 40 }, sketch({ id: 'lanai' }))
    expect(result.outcome).toBe('moved')
    expect(result.box.x + result.box.width).toBeLessThanOrEqual(120)
  })

  it('shrinks an object too big for the space, keeping its proportions', () => {
    const result = fitIntoSpace({ x: 0, y: 0, width: 400, height: 200 }, sketch({ id: 'lanai' }))
    expect(result.outcome).toBe('resized')
    expect(result.box.width / result.box.height).toBeCloseTo(2, 5)
  })

  it('leaves clear space at the edge rather than butting up to the line', () => {
    const result = fitIntoSpace({ x: 118, y: 50, width: 20, height: 20 }, sketch({ id: 'lanai' }))
    expect(result.box.x + result.box.width).toBeLessThanOrEqual(114 + 1e-9)
  })
})

describe('spaceName', () => {
  it('uses what the drawer called it', () => {
    expect(spaceName(sketch({ id: 'a', labelText: 'Lanai' } as Partial<Shape> & { id: string }))).toBe('Lanai')
  })

  it('falls back to a neutral word rather than an id', () => {
    expect(spaceName(sketch({ id: 'a' }))).toBe('the outline')
  })
})
