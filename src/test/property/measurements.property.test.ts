// Property tests for measurement derivation.
//
// Every downstream number depends on these: the quote prices off surface area
// and perimeter, validation checks depths, the proposal prints gallons. A
// measurement bug is not a display bug, it is a wrong price on a signed
// contract, so the invariants here are worth stating explicitly.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { computeMeasurements } from '@/modules/measurements/engine'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

/** Sizes in inches, the canvas unit. Up to 100 feet a side. */
const size = fc.integer({ min: 12, max: 1_200 })
const coord = fc.integer({ min: -600, max: 600 })
const depth = fc.double({ min: 1, max: 12, noNaN: true, noDefaultInfinity: true })

let counter = 0
function nextId(): string {
  counter += 1
  return `shape-${counter}`
}

const rectanglePool = fc
  .record({ x: coord, y: coord, width: size, height: size, shallow: depth, deep: depth })
  .map(
    (spec): Shape =>
      ({
        id: nextId(),
        kind: ShapeKind.RECTANGLE_POOL,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        rotation: 0,
        zIndex: 1,
        locked: false,
        hidden: false,
        depthShallow: Math.min(spec.shallow, spec.deep),
        depthDeep: Math.max(spec.shallow, spec.deep),
      }) as Shape,
  )

const deck = fc.record({ x: coord, y: coord, width: size, height: size }).map(
  (spec): Shape =>
    ({
      id: nextId(),
      kind: ShapeKind.PAVER_DECK,
      x: spec.x,
      y: spec.y,
      width: spec.width,
      height: spec.height,
      rotation: 0,
      zIndex: 2,
      locked: false,
      hidden: false,
    }) as Shape,
)

const anyShape = fc.oneof(rectanglePool, deck)

/** Scale a shape's extent, leaving position and depth alone. */
function scaled(shape: Shape, factor: number): Shape {
  return { ...shape, id: nextId(), width: shape.width * factor, height: shape.height * factor }
}

describe('computeMeasurements invariants', () => {
  it('never reports a negative figure', () => {
    fc.assert(
      fc.property(fc.array(anyShape, { maxLength: 12 }), shapes => {
        const m = computeMeasurements(shapes)
        for (const [key, value] of Object.entries(m)) {
          if (typeof value === 'number') {
            expect(value, `${key} is negative`).toBeGreaterThanOrEqual(0)
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('measures nothing when there is nothing to measure', () => {
    const empty = computeMeasurements([])
    expect(empty.hasPool).toBe(false)
    expect(empty.hasDeck).toBe(false)
    expect(empty.poolSurfaceArea).toBe(0)
    expect(empty.poolGallons).toBe(0)
  })

  it('ignores hidden shapes entirely', () => {
    // Hiding a layer is a view choice. If it changed the quote, a designer
    // toggling visibility would silently reprice the job.
    fc.assert(
      fc.property(fc.array(anyShape, { minLength: 1, maxLength: 8 }), shapes => {
        const hidden = shapes.map(shape => ({ ...shape, hidden: true }))
        const m = computeMeasurements(hidden)
        expect(m.poolSurfaceArea).toBe(0)
        expect(m.deckArea).toBe(0)
        expect(m.hasPool).toBe(false)
        expect(m.hasDeck).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('does not depend on the order shapes were added', () => {
    // Layer order is a rendering concern. The same yard must measure the same
    // however it was drawn.
    fc.assert(
      fc.property(fc.array(anyShape, { maxLength: 10 }), shapes => {
        const forward = computeMeasurements(shapes)
        const backward = computeMeasurements([...shapes].reverse())
        expect(backward.poolSurfaceArea).toBeCloseTo(forward.poolSurfaceArea, 6)
        expect(backward.poolGallons).toBeCloseTo(forward.poolGallons, 6)
        expect(backward.deckArea).toBeCloseTo(forward.deckArea, 6)
        expect(backward.poolPerimeter).toBeCloseTo(forward.poolPerimeter, 6)
      }),
      { numRuns: 300 },
    )
  })

  it('does not depend on where in the yard anything sits', () => {
    // Nothing here is a distance between shapes, so translating the whole scene
    // must not move a single figure.
    fc.assert(
      fc.property(fc.array(anyShape, { maxLength: 8 }), coord, coord, (shapes, dx, dy) => {
        const moved = shapes.map(shape => ({ ...shape, x: shape.x + dx, y: shape.y + dy }))
        expect(computeMeasurements(moved)).toEqual(computeMeasurements(shapes))
      }),
      { numRuns: 300 },
    )
  })

  it('scales area with the square of a size change', () => {
    // The classic unit bug: an area that scales linearly means a length was
    // used where an area belonged.
    fc.assert(
      fc.property(rectanglePool, fc.integer({ min: 2, max: 5 }), (pool, factor) => {
        const before = computeMeasurements([pool])
        const after = computeMeasurements([scaled(pool, factor)])
        expect(after.poolSurfaceArea).toBeCloseTo(before.poolSurfaceArea * factor * factor, 4)
      }),
      { numRuns: 200 },
    )
  })

  it('scales perimeter linearly with a size change', () => {
    fc.assert(
      fc.property(rectanglePool, fc.integer({ min: 2, max: 5 }), (pool, factor) => {
        const before = computeMeasurements([pool])
        const after = computeMeasurements([scaled(pool, factor)])
        expect(after.poolPerimeter).toBeCloseTo(before.poolPerimeter * factor, 4)
      }),
      { numRuns: 200 },
    )
  })

  it('adds up across several pools rather than overwriting', () => {
    // Two pools in one yard is a real design. An implementation that assigned
    // instead of accumulating would report only the last one.
    fc.assert(
      fc.property(rectanglePool, rectanglePool, (a, b) => {
        const combined = computeMeasurements([a, b])
        const separate = computeMeasurements([a]).poolSurfaceArea + computeMeasurements([b]).poolSurfaceArea
        expect(combined.poolSurfaceArea).toBeCloseTo(separate, 4)
      }),
      { numRuns: 200 },
    )
  })

  it('keeps the deepest depth when there is more than one pool', () => {
    fc.assert(
      fc.property(rectanglePool, rectanglePool, (a, b) => {
        const combined = computeMeasurements([a, b])
        const deepest = Math.max(
          (a as { depthDeep: number }).depthDeep,
          (b as { depthDeep: number }).depthDeep,
        )
        expect(combined.poolDepthDeep).toBeCloseTo(deepest, 6)
      }),
      { numRuns: 200 },
    )
  })

  it('grows gallons with depth and never shrinks them', () => {
    fc.assert(
      fc.property(rectanglePool, fc.double({ min: 0.5, max: 4, noNaN: true }), (pool, extra) => {
        const typed = pool as Shape & { depthShallow: number; depthDeep: number }
        const deeper = {
          ...typed,
          id: nextId(),
          depthShallow: typed.depthShallow + extra,
          depthDeep: typed.depthDeep + extra,
        } as Shape
        expect(computeMeasurements([deeper]).poolGallons).toBeGreaterThanOrEqual(
          computeMeasurements([pool]).poolGallons,
        )
      }),
      { numRuns: 200 },
    )
  })

  it('reports a pool exactly when one is present', () => {
    fc.assert(
      fc.property(fc.array(anyShape, { maxLength: 10 }), shapes => {
        const hasPool = shapes.some(shape => shape.kind === ShapeKind.RECTANGLE_POOL && !shape.hidden)
        expect(computeMeasurements(shapes).hasPool).toBe(hasPool)
      }),
      { numRuns: 300 },
    )
  })

  it('is deterministic', () => {
    fc.assert(
      fc.property(fc.array(anyShape, { maxLength: 10 }), shapes => {
        expect(computeMeasurements(shapes)).toEqual(computeMeasurements(shapes))
      }),
      { numRuns: 200 },
    )
  })
})
