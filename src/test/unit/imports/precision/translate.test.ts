import { describe, it, expect } from 'vitest'
import { emptyDesignIntent, type DesignIntent, type Point } from '@/modules/imports/intent'
import { footprintFromImageSpace, intentToShapes, type PolygonPoolShape, type TranslatedShape } from '@/modules/imports/precision/translate'
import { ShapeKind } from '@/modules/editor/state/shapes'
import { polygonAreaSqft, type Point as Tuple } from '@/lib/geometry/polygon'

const INCHES_PER_FOOT = 12

function areaSqft(points: readonly Point[]): number {
  return polygonAreaSqft(points.map((p) => [p.x, p.y] as Tuple))
}

function scaledIntent(patch: (intent: DesignIntent) => void = () => {}): DesignIntent {
  const intent = emptyDesignIntent(['img_1'])
  intent.scale = { pixelsPerInch: 10, method: 'grid', confidence: 0.95 }
  patch(intent)
  return intent
}

function rect(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function isPolygonPool(shape: TranslatedShape): shape is PolygonPoolShape {
  return shape.kind === 'POLYGON_POOL'
}

describe('the scale gate', () => {
  it('refuses to emit geometry when pixelsPerInch is null', () => {
    const intent = emptyDesignIntent(['img_1'])
    intent.pool.footprint = { points: rect(0, 0, 300, 150) }
    intent.pool.lengthFt = 25
    intent.pool.widthFt = 12

    const result = intentToShapes(intent)
    expect(result.shapes).toEqual([])
    expect(result.warnings.join(' ')).toContain('scale is unresolved')
  })

  it('refuses when pixelsPerInch is zero or negative', () => {
    for (const ppi of [0, -5]) {
      const intent = emptyDesignIntent(['img_1'])
      intent.scale = { pixelsPerInch: ppi, method: 'manual', confidence: 1 }
      intent.pool.lengthFt = 25
      intent.pool.widthFt = 12
      expect(intentToShapes(intent).shapes).toEqual([])
    }
  })
})

describe('the pool', () => {
  it('becomes a polygon pool when a footprint exists', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(100, 200, 300, 150) }
      i.pool.shapeFamily = 'freeform'
      i.pool.depthShallowFt = 3.5
      i.pool.depthDeepFt = 6
    })

    const { shapes } = intentToShapes(intent)
    expect(shapes).toHaveLength(1)
    const pool = shapes[0]!
    expect(isPolygonPool(pool)).toBe(true)
    if (!isPolygonPool(pool)) return

    expect(pool.width).toBe(300)
    expect(pool.height).toBe(150)
    expect(pool.depthShallow).toBe(3.5)
    expect(pool.depthDeep).toBe(6)
    // Points are inches relative to the shape origin, matching the renderer.
    expect(pool.points).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 150 },
      { x: 0, y: 150 },
    ])
  })

  it('measures the footprint it was given, not its bounding box', () => {
    // An L, whose bounding box is half again its real area.
    const l: Point[] = [
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 120 },
      { x: 120, y: 120 },
      { x: 120, y: 240 },
      { x: 0, y: 240 },
    ]
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: l }
      i.pool.shapeFamily = 'lshape'
    })
    const pool = intentToShapes(intent).shapes[0]!
    expect(isPolygonPool(pool)).toBe(true)
    if (!isPolygonPool(pool)) return
    // 240x240 minus a 120x120 bite = 43200 sq in = 300 sqft.
    expect(areaSqft(pool.points)).toBeCloseTo(300, 6)
  })

  it('drops a repeated closing vertex rather than emitting a zero-length edge', () => {
    const closed = [...rect(0, 0, 120, 60), { x: 0, y: 0 }]
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: closed }
    })
    const pool = intentToShapes(intent).shapes[0]!
    if (!isPolygonPool(pool)) throw new Error('expected a polygon pool')
    expect(pool.points).toHaveLength(4)
  })

  it('falls back to a rectangle built from the read dimensions', () => {
    const intent = scaledIntent((i) => {
      i.pool.shapeFamily = 'rectangle'
      i.pool.lengthFt = 30
      i.pool.widthFt = 15
    })
    const { shapes } = intentToShapes(intent)
    expect(shapes).toHaveLength(1)
    expect(shapes[0]!.kind).toBe(ShapeKind.RECTANGLE_POOL)
    expect(shapes[0]!.width).toBe(30 * INCHES_PER_FOOT)
    expect(shapes[0]!.height).toBe(15 * INCHES_PER_FOOT)
  })

  it('marks an oval without a footprint as an ellipse so it measures as one', () => {
    const intent = scaledIntent((i) => {
      i.pool.shapeFamily = 'oval'
      i.pool.lengthFt = 30
      i.pool.widthFt = 15
    })
    const pool = intentToShapes(intent).shapes[0]!
    expect(pool.displayHint?.poolShape).toBe('ellipse')
  })

  it('warns when a named shape family had to be approximated as a rectangle', () => {
    const intent = scaledIntent((i) => {
      i.pool.shapeFamily = 'kidney'
      i.pool.lengthFt = 30
      i.pool.widthFt = 15
    })
    expect(intentToShapes(intent).warnings.join(' ')).toContain('kidney')
  })

  it('warns loudly when it has to invent the depths', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
    })
    const { shapes, warnings } = intentToShapes(intent)
    const pool = shapes[0]!
    if (!isPolygonPool(pool)) throw new Error('expected a polygon pool')
    expect(pool.depthShallow).toBe(3)
    expect(pool.depthDeep).toBe(5)
    expect(warnings.join(' ')).toContain('pool depths were not read')
  })

  it('produces nothing but a warning when there is neither a footprint nor dimensions', () => {
    const result = intentToShapes(scaledIntent())
    expect(result.shapes).toEqual([])
    expect(result.warnings.join(' ')).toContain('no pool footprint and no length/width')
  })

  it('discards a footprint that collapsed to fewer than three vertices', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = {
        points: [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
      }
      i.pool.lengthFt = 20
      i.pool.widthFt = 10
    })
    const { shapes, warnings } = intentToShapes(intent)
    expect(warnings.join(' ')).toContain('collapsed to fewer than 3')
    expect(shapes[0]!.kind).toBe(ShapeKind.RECTANGLE_POOL)
  })
})

describe('the deck', () => {
  it('maps material to the priced deck kind', () => {
    const cases: [DesignIntent['deck']['material'], ShapeKind][] = [
      ['concrete', ShapeKind.CONCRETE_DECK],
      ['paver', ShapeKind.PAVER_DECK],
      ['travertine', ShapeKind.PAVER_DECK],
      ['grass', ShapeKind.GRASS_AREA],
    ]
    for (const [material, kind] of cases) {
      const intent = scaledIntent((i) => {
        i.pool.lengthFt = 25
        i.pool.widthFt = 12
        i.deck.material = material
        i.deck.footprint = { points: rect(0, 0, 480, 300) }
      })
      const deck = intentToShapes(intent).shapes.find((s) => s.kind === kind)
      expect(deck, material).toBeDefined()
    }
  })

  it('defaults an unidentified material to concrete and says so', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.deck.footprint = { points: rect(0, 0, 480, 300) }
    })
    const { shapes, warnings } = intentToShapes(intent)
    expect(shapes.some((s) => s.kind === ShapeKind.CONCRETE_DECK)).toBe(true)
    expect(warnings.join(' ')).toContain('defaulted to concrete')
  })

  it('warns that a non-rectangular deck was reduced to its bounding box', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.deck.material = 'paver'
      i.deck.footprint = {
        points: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 200 },
          { x: 200, y: 200 },
          { x: 200, y: 400 },
          { x: 0, y: 400 },
        ],
      }
    })
    expect(intentToShapes(intent).warnings.join(' ')).toContain('bounding box')
  })

  it('says nothing about the bounding box when the deck really is rectangular', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.deck.material = 'paver'
      i.deck.footprint = { points: rect(0, 0, 480, 300) }
    })
    expect(intentToShapes(intent).warnings.join(' ')).not.toContain('bounding box')
  })
})

describe('features', () => {
  it('resolves a stencil id to its dedicated shape kind', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'feature.sun-shelf',
          label: 'Sun shelf',
          lengthFt: 8,
          widthFt: 5,
          count: 1,
          x: 60,
          y: 40,
        },
      ]
    })
    const shelf = intentToShapes(intent).shapes.find((s) => s.kind === ShapeKind.SUN_SHELF)
    expect(shelf).toBeDefined()
    expect(shelf!.width).toBe(96)
    expect(shelf!.height).toBe(60)
    expect(shelf!.name).toBe('Sun shelf')
  })

  it('centres a feature on the position the model gave', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 600, 300) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'feature.bench',
          label: 'Bench',
          lengthFt: 10,
          widthFt: 2,
          count: 1,
          x: 300,
          y: 150,
        },
      ]
    })
    const bench = intentToShapes(intent).shapes.find((s) => s.kind === ShapeKind.BENCH)!
    expect(bench.x + bench.width / 2).toBeCloseTo(300, 6)
    expect(bench.y + bench.height / 2).toBeCloseTo(150, 6)
  })

  it('falls back to a generic stencil shape when the catalog entry has no dedicated kind', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'feature.bubblers',
          label: 'Bubblers',
          lengthFt: null,
          widthFt: null,
          count: 1,
          x: 100,
          y: 50,
        },
      ]
    })
    const shapes = intentToShapes(intent).shapes
    const bubblers = shapes.find((s) => s.kind === ShapeKind.STENCIL)
    expect(bubblers).toBeDefined()
  })

  it('does not emit a pool kind for a pool stencil listed as a feature', () => {
    // `pool.rectangle` maps to RECTANGLE_POOL, which needs depths a feature
    // never carries. Emitting it as a pool would produce a malformed shape.
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'pool.rectangle',
          label: 'Second pool?',
          lengthFt: 10,
          widthFt: 5,
          count: 1,
          x: 100,
          y: 50,
        },
      ]
    })
    const { shapes } = intentToShapes(intent)
    const extra = shapes.find((s) => s.name === 'Second pool?')!
    expect(extra.kind).toBe(ShapeKind.STENCIL)
    expect(shapes.filter((s) => s.kind === ShapeKind.RECTANGLE_POOL)).toHaveLength(0)
  })

  it('emits a dedicated spa kind for a spa stencil', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: null,
          label: 'Spa',
          lengthFt: 8,
          widthFt: 8,
          count: 1,
          x: 100,
          y: 50,
        },
      ]
    })
    expect(intentToShapes(intent).shapes.some((s) => s.kind === ShapeKind.SPA)).toBe(true)
  })

  it('emits one shape per count, side by side', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 600, 300) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'feature.light',
          label: 'Light',
          lengthFt: null,
          widthFt: null,
          count: 3,
          x: 200,
          y: 100,
        },
      ]
    })
    const lights = intentToShapes(intent).shapes.filter((s) => s.name === 'Light')
    expect(lights).toHaveLength(3)
    const xs = lights.map((l) => l.x)
    expect(new Set(xs).size).toBe(3)
  })

  it('matches a bare label when no stencil id was resolved', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: null,
          label: 'Tanning ledge on the west end',
          lengthFt: null,
          widthFt: null,
          count: 1,
          x: 20,
          y: 20,
        },
      ]
    })
    const { shapes, warnings } = intentToShapes(intent)
    expect(shapes).toHaveLength(2)
    expect(warnings.join(' ')).not.toContain('did not match a stencil')
  })

  it('skips an unmatched feature with a warning rather than guessing', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'no.such.stencil',
          label: 'Mystery thing',
          lengthFt: null,
          widthFt: null,
          count: 1,
          x: 0,
          y: 0,
        },
      ]
    })
    const { shapes, warnings } = intentToShapes(intent)
    expect(shapes).toHaveLength(1)
    expect(warnings.join(' ')).toContain('did not match a stencil')
  })

  it('lays out a feature with no position and says it did so', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.features = [
        {
          stencilId: 'feature.bench',
          label: 'Bench',
          lengthFt: null,
          widthFt: null,
          count: 1,
          x: null,
          y: null,
        },
      ]
    })
    expect(intentToShapes(intent).warnings.join(' ')).toContain('had no position')
  })
})

describe('enclosure and site', () => {
  it('maps a screen enclosure to the screen cage stencil', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.enclosure = {
        present: true,
        kind: 'screen',
        heightFt: 12,
        footprint: { points: rect(0, 0, 600, 400) },
      }
    })
    const cage = intentToShapes(intent).shapes.find(
      (s) => s.kind === ShapeKind.STENCIL && 'stencilId' in s && s.stencilId === 'deck.screen-cage',
    )
    expect(cage).toBeDefined()
    expect(cage!.width).toBe(600)
  })

  it('warns when an enclosure was seen but its outline was not', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.enclosure = { present: true, kind: 'lanai', heightFt: 10, footprint: null }
    })
    expect(intentToShapes(intent).warnings.join(' ')).toContain('outline was not')
  })

  it('emits nothing for an absent enclosure', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
    })
    expect(intentToShapes(intent).shapes).toHaveLength(1)
  })

  it('names site geometry it had to drop', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
      i.site.propertyBoundary = { points: rect(0, 0, 2000, 1500) }
      i.site.houseFootprint = { points: rect(100, 100, 600, 400) }
    })
    const warning = intentToShapes(intent).warnings.join(' ')
    expect(warning).toContain('property boundary and house footprint')
    expect(warning).toContain('not applied')
  })
})

describe('normalization', () => {
  it('moves the whole assembly to the origin without disturbing its layout', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(1000, 800, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.deck.material = 'concrete'
      i.deck.footprint = { points: rect(940, 740, 480, 300) }
    })
    const { shapes } = intentToShapes(intent)
    const minX = Math.min(...shapes.map((s) => s.x))
    const minY = Math.min(...shapes.map((s) => s.y))
    expect(minX).toBe(0)
    expect(minY).toBe(0)

    const pool = shapes.find(isPolygonPool)!
    const deck = shapes.find((s) => s.kind === ShapeKind.CONCRETE_DECK)!
    // The pool sat 60in inside the deck in the source frame and still does.
    expect(pool.x - deck.x).toBeCloseTo(60, 6)
    expect(pool.y - deck.y).toBeCloseTo(60, 6)
  })

  it('honours a requested origin', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(1000, 800, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
    })
    const { shapes } = intentToShapes(intent, { originInches: { x: 120, y: 240 } })
    expect(shapes[0]!.x).toBe(120)
    expect(shapes[0]!.y).toBe(240)
  })

  it('gives the pool the lowest zIndex', () => {
    const intent = scaledIntent((i) => {
      i.pool.footprint = { points: rect(0, 0, 300, 150) }
      i.pool.depthShallowFt = 3
      i.pool.depthDeepFt = 6
      i.deck.material = 'paver'
      i.deck.footprint = { points: rect(-60, -60, 480, 300) }
      i.features = [
        {
          stencilId: 'feature.bench',
          label: 'Bench',
          lengthFt: 8,
          widthFt: 1.5,
          count: 1,
          x: 100,
          y: 100,
        },
      ]
    })
    const { shapes } = intentToShapes(intent)
    const pool = shapes.find(isPolygonPool)!
    expect(pool.zIndex).toBe(0)
    for (const shape of shapes) {
      if (shape === pool) continue
      expect(shape.zIndex).toBeGreaterThan(pool.zIndex)
    }
    expect(shapes.map((s) => s.zIndex)).toEqual(shapes.map((_, i) => i))
  })

  it('gives every shape a distinct id and stays deterministic across runs', () => {
    const build = () =>
      intentToShapes(
        scaledIntent((i) => {
          i.pool.footprint = { points: rect(0, 0, 300, 150) }
          i.pool.depthShallowFt = 3
          i.pool.depthDeepFt = 6
          i.deck.material = 'concrete'
          i.deck.footprint = { points: rect(-60, -60, 480, 300) }
        }),
      )
    const first = build()
    const second = build()
    expect(first.shapes.map((s) => s.id)).toEqual(second.shapes.map((s) => s.id))
    expect(new Set(first.shapes.map((s) => s.id)).size).toBe(first.shapes.length)
  })

  it('accepts a caller-supplied id factory', () => {
    const intent = scaledIntent((i) => {
      i.pool.lengthFt = 25
      i.pool.widthFt = 12
    })
    const { shapes } = intentToShapes(intent, {
      idFactory: (kind, ordinal) => `session42-${kind}-${ordinal}`,
    })
    expect(shapes[0]!.id).toBe('session42-RECTANGLE_POOL-1')
  })
})

// Setting a scale is only half of calibrating. The extractor's outline lives in
// normalized image space, and until it is converted to inches there is no
// footprint, so applying the import produced the features and no pool: a spa
// and a tanning ledge in the layers panel, every computed measurement zero, and
// the pool the user drew simply absent from the drawing.
describe('footprintFromImageSpace', () => {
  const square = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ]

  it('converts normalized points into inches at the given scale', () => {
    // 0.5 of a 1200px frame is 600px; at 2 px/inch that is 300 inches, 25 ft.
    const fp = footprintFromImageSpace(square, 1200, 800, 2)
    expect(fp).not.toBeNull()
    if (!fp) return
    const xs = fp.points.map(p => p.x)
    const ys = fp.points.map(p => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(300, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200, 6)
  })

  it('rebases to the outline top-left so the footprint is shape-local', () => {
    const fp = footprintFromImageSpace(square, 1200, 800, 2)
    expect(fp).not.toBeNull()
    if (!fp) return
    expect(Math.min(...fp.points.map(p => p.x))).toBeCloseTo(0, 6)
    expect(Math.min(...fp.points.map(p => p.y))).toBeCloseTo(0, 6)
  })

  it('halving the scale doubles the real size', () => {
    const a = footprintFromImageSpace(square, 1200, 800, 2)
    const b = footprintFromImageSpace(square, 1200, 800, 1)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    if (!a || !b) return
    const widthOf = (f: typeof a) => Math.max(...f.points.map(p => p.x))
    expect(widthOf(b)).toBeCloseTo(widthOf(a) * 2, 6)
  })

  it('refuses degenerate input rather than emitting a broken pool', () => {
    expect(footprintFromImageSpace(square, 1200, 800, 0)).toBeNull()
    expect(footprintFromImageSpace(square, 0, 800, 2)).toBeNull()
    expect(footprintFromImageSpace(square.slice(0, 2), 1200, 800, 2)).toBeNull()
  })

  it('produces a footprint intentToShapes will actually emit a pool from', () => {
    const fp = footprintFromImageSpace(square, 1200, 800, 2)
    expect(fp).not.toBeNull()
    if (!fp) return

    const intent = emptyDesignIntent(['img-1'])
    intent.scale = { pixelsPerInch: 2, method: 'manual', confidence: 1 }
    intent.pool = { ...intent.pool, footprint: fp, shapeFamily: 'rectangle' }

    const { shapes } = intentToShapes(intent)
    expect(shapes.some(s => s.kind === ShapeKind.POLYGON_POOL), 'a pool must be created').toBe(true)
  })
})
