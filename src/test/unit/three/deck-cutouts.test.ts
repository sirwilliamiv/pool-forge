// A deck laid around a pool is, geometrically, a slab straight over the water.
// `Deck` has always accepted cutouts and nothing ever computed any, so the pool
// disappeared under it. These pin the cases that matter.

import { describe, expect, it } from 'vitest'

import { cutoutsFor } from '@/components/editor/three/SceneRoot'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

function pool(overrides: Record<string, unknown> = {}): Shape {
  return {
    id: 'pool-1',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: 384,
    height: 192,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 5,
    ...overrides,
  } as Shape
}

function deck(overrides: Record<string, unknown> = {}): Shape {
  return {
    id: 'deck-1',
    kind: ShapeKind.PAVER_DECK,
    x: -48,
    y: -48,
    width: 480,
    height: 288,
    rotation: 0,
    zIndex: 2,
    locked: false,
    hidden: false,
    ...overrides,
  } as Shape
}

describe('deck cutouts', () => {
  it('cuts a pool out of the deck laid around it', () => {
    // The exact case the voice agent builds: a 32x16 pool with four feet of
    // paver on every side.
    const cutouts = cutoutsFor(deck(), [pool(), deck()])
    expect(cutouts).toHaveLength(1)
    const hole = cutouts[0]!
    expect(hole.kind).toBe('rect')
    // Both are centred on the same point, so the hole sits at the deck's origin.
    expect(hole.x).toBeCloseTo(0)
    expect(hole.z).toBeCloseTo(0)
  })

  it('leaves open concrete alone', () => {
    // A spa across the yard must not punch a hole in a deck it never touches.
    const faraway = pool({ id: 'spa-1', kind: ShapeKind.SPA, x: 2_000, y: 2_000, width: 96, height: 96 })
    expect(cutoutsFor(deck(), [faraway, deck()])).toHaveLength(0)
  })

  it('does not cut around a hidden pool', () => {
    expect(cutoutsFor(deck(), [pool({ hidden: true }), deck()])).toHaveLength(0)
  })

  it('does not cut a deck out of another deck', () => {
    // Two overlapping decks are a paving choice, not a hole.
    const other = deck({ id: 'deck-2', kind: ShapeKind.CONCRETE_DECK })
    expect(cutoutsFor(deck(), [other, deck()])).toHaveLength(0)
  })

  it('cuts a round hole for an oval pool', () => {
    const oval = pool({ displayHint: { poolShape: 'ellipse' } })
    const cutouts = cutoutsFor(deck(), [oval, deck()])
    expect(cutouts[0]?.kind).toBe('circle')
    expect(cutouts[0]?.radius).toBeGreaterThan(0)
  })

  it('places the hole where the pool actually is, not at the centre', () => {
    // Offsetting the pool must move the hole with it, or the geometry cuts the
    // wrong part of the slab and the pool is still buried.
    const offset = pool({ x: 96, y: 48 })
    const centred = cutoutsFor(deck(), [pool(), deck()])[0]!
    const moved = cutoutsFor(deck(), [offset, deck()])[0]!
    expect(moved.x).toBeGreaterThan(centred.x)
    expect(moved.z).toBeGreaterThan(centred.z)
  })
})
