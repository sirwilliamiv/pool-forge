// Putting the camera where a box fills the view.
//
// Shared by "frame the selection" and "fit everything" so the two cannot drift:
// a fit that framed differently from a frame would look like a bug in whichever
// one the user tried second.

import { describe, expect, it } from 'vitest'

import { framingFor } from '@/modules/editor/framing'

const POOL = { x: 0, y: 0, width: 384, height: 192 }

describe('framingFor', () => {
  it('looks at the centre of the box', () => {
    const { target } = framingFor(POOL)
    // 384 inches is 32 feet, so the centre sits at 16 feet across, 8 back.
    expect(target[0]).toBeCloseTo(16, 5)
    expect(target[1]).toBe(0)
    expect(target[2]).toBeCloseTo(8, 5)
  })

  it('backs off further for a bigger box', () => {
    const near = framingFor(POOL)
    const far = framingFor({ ...POOL, width: 4_000, height: 3_000 })
    expect(distance(far)).toBeGreaterThan(distance(near))
  })

  it('does not fly into a single small object', () => {
    // A floor on the distance, or selecting one light fills the screen with it.
    const tiny = framingFor({ x: 0, y: 0, width: 6, height: 6 })
    expect(distance(tiny)).toBeGreaterThanOrEqual(15)
  })

  it('stays above the ground', () => {
    expect(framingFor(POOL).pose[1]).toBeGreaterThan(0)
  })

  it('keeps the same angle whatever the box', () => {
    // Framing must not swing the camera to a new orientation: the user asked to
    // see everything, not to be spun around.
    const a = framingFor(POOL)
    const b = framingFor({ x: 900, y: -400, width: 1_200, height: 800 })
    expect(elevationOf(a)).toBeCloseTo(elevationOf(b), 6)
  })

  it('frames a box that sits away from the origin', () => {
    const { target } = framingFor({ x: 1_200, y: 600, width: 120, height: 120 })
    expect(target[0]).toBeCloseTo(105, 5)
    expect(target[2]).toBeCloseTo(55, 5)
  })

  it('leaves a margin around the content', () => {
    // More padding means standing further back, so nothing is flush to the edge.
    const tight = framingFor(POOL, 0)
    const padded = framingFor(POOL, 0.5)
    expect(distance(padded)).toBeGreaterThan(distance(tight))
  })
})

function distance({ pose, target }: ReturnType<typeof framingFor>): number {
  return Math.hypot(pose[0] - target[0], pose[1] - target[1], pose[2] - target[2])
}

/** Angle above the ground plane, which must not change between framings. */
function elevationOf({ pose, target }: ReturnType<typeof framingFor>): number {
  const horizontal = Math.hypot(pose[0] - target[0], pose[2] - target[2])
  return Math.atan2(pose[1] - target[1], horizontal)
}
