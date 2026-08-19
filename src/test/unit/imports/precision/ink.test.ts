// Snapping a model outline onto the marks actually on the paper.
//
// On a real photo the model returned a pool outline of the right size and shape
// but placed a fifth of the frame away from the drawing. Vision models are
// reliable about what a shape is and unreliable about where it is, so position
// has to be recovered from the pixels like every other number.

import { describe, expect, it } from 'vitest'

import {
  autoWindowPx,
  connectedRegions,
  erode,
  findFilledRegions,
  inkMask,
  snapPolygonToInk,
  type Point,
} from '@/modules/imports/precision/ink'

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Graph paper with optional filled rectangles drawn on it, plus a lighting
 * gradient and noise so the thresholding is exercised the way a phone photo
 * exercises it.
 */
function sheet(
  width: number,
  height: number,
  fills: Rect[],
  options: { gridPitch?: number; gradient?: number; noise?: number } = {},
): Uint8ClampedArray {
  const { gridPitch = 10, gradient = 40, noise = 0 } = options
  const px = new Uint8ClampedArray(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Paper, lit unevenly across the frame.
      let v = 235 - Math.round((gradient * (x + y)) / (width + height))
      if (x % gridPitch === 0 || y % gridPitch === 0) v -= 28 // thin grid rules
      if (noise > 0) v -= Math.round(((x * 7 + y * 13) % noise) - noise / 2)
      px[y * width + x] = Math.max(0, Math.min(255, v))
    }
  }

  for (const r of fills) {
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        px[y * width + x] = 40 // heavy marker fill
      }
    }
  }
  return px
}

function bboxOf(points: readonly Point[]) {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

function rectPolygon(r: Rect): Point[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: (r.x0 + r.x1) / 2, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: (r.y0 + r.y1) / 2 },
    { x: r.x1, y: r.y1 },
    { x: (r.x0 + r.x1) / 2, y: r.y1 },
    { x: r.x0, y: r.y1 },
    { x: r.x0, y: (r.y0 + r.y1) / 2 },
  ]
}

const W = 400
const H = 300

describe('autoWindowPx', () => {
  it('scales with the image rather than being fixed', () => {
    // A window smaller than the shape makes the shape its own background, so a
    // large filled rectangle disappears entirely. That is the bug this exists
    // to prevent: at a fixed 24px the pool went undetected while the grid rules
    // were found perfectly.
    expect(autoWindowPx(1176, 1568)).toBeGreaterThan(100)
    expect(autoWindowPx(1176, 1568)).toBe(118)
    expect(autoWindowPx(80, 60)).toBe(24)
  })
})

describe('erode', () => {
  it('deletes one-pixel lines and keeps solid areas', () => {
    const mask = new Uint8Array(20 * 20)
    for (let x = 0; x < 20; x++) mask[5 * 20 + x] = 1 // a thin rule
    for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) mask[y * 20 + x] = 1 // a block

    const out = erode(mask, 20, 20)
    expect([...out.slice(5 * 20, 6 * 20)].some(v => v === 1), 'the rule must vanish').toBe(false)
    expect(out[12 * 20 + 12], 'the block interior must survive').toBe(1)
  })
})

describe('findFilledRegions', () => {
  it('finds a filled rectangle on graph paper and ignores the rules', () => {
    const fill = { x0: 120, y0: 90, x1: 240, y1: 170 }
    const regions = findFilledRegions(sheet(W, H, [fill]), W, H)

    expect(regions.length).toBeGreaterThan(0)
    const found = regions[0]
    expect(found).toBeDefined()
    if (!found) return
    expect(Math.abs(found.minX - fill.x0)).toBeLessThan(6)
    expect(Math.abs(found.maxX - fill.x1)).toBeLessThan(6)
    expect(Math.abs(found.minY - fill.y0)).toBeLessThan(6)
    expect(Math.abs(found.maxY - fill.y1)).toBeLessThan(6)
  })

  it('survives a lighting gradient and noise, which a global threshold does not', () => {
    const fill = { x0: 250, y0: 60, x1: 340, y1: 130 }
    const regions = findFilledRegions(sheet(W, H, [fill], { gradient: 90, noise: 26 }), W, H)
    const found = regions[0]
    expect(found).toBeDefined()
    if (!found) return
    expect(Math.abs(found.minX - fill.x0)).toBeLessThan(10)
    expect(Math.abs(found.maxY - fill.y1)).toBeLessThan(10)
  })

  it('returns nothing on blank paper rather than inventing a shape', () => {
    expect(findFilledRegions(sheet(W, H, []), W, H)).toHaveLength(0)
  })

  it('separates two filled shapes', () => {
    const regions = findFilledRegions(
      sheet(W, H, [
        { x0: 40, y0: 40, x1: 140, y1: 110 },
        { x0: 240, y0: 170, x1: 300, y1: 230 },
      ]),
      W,
      H,
    )
    expect(regions.length).toBeGreaterThanOrEqual(2)
  })
})

describe('snapPolygonToInk', () => {
  it('moves an offset outline onto the shape it was describing', () => {
    const fill = { x0: 150, y0: 100, x1: 260, y1: 175 }
    const data = sheet(W, H, [fill])

    // Same size and proportions, wrong place: the real failure mode.
    const offset = rectPolygon({ x0: 60, y0: 160, x1: 170, y1: 235 })
    const result = snapPolygonToInk(offset, data, W, H)

    expect(result.region, 'a filled shape was present, so it must snap').not.toBeNull()
    const box = bboxOf(result.points)
    expect(Math.abs(box.minX - fill.x0)).toBeLessThan(10)
    expect(Math.abs(box.minY - fill.y0)).toBeLessThan(10)
    expect(Math.abs(box.maxX - fill.x1)).toBeLessThan(10)
    expect(Math.abs(box.maxY - fill.y1)).toBeLessThan(10)
  })

  it('preserves the vertex count and the shape of the outline', () => {
    const data = sheet(W, H, [{ x0: 150, y0: 100, x1: 260, y1: 175 }])
    const offset = rectPolygon({ x0: 60, y0: 160, x1: 170, y1: 235 })
    const result = snapPolygonToInk(offset, data, W, H)
    expect(result.points).toHaveLength(offset.length)
  })

  it('passes the outline through untouched when nothing is drawn', () => {
    const data = sheet(W, H, [])
    const original = rectPolygon({ x0: 60, y0: 60, x1: 160, y1: 130 })
    const result = snapPolygonToInk(original, data, W, H)
    expect(result.region).toBeNull()
    expect(result.points).toEqual(original)
  })

  it('refuses a candidate whose area is wildly different', () => {
    // A tiny mark should never capture a large outline: better to keep the
    // model's placement than to snap confidently onto the wrong thing.
    const data = sheet(W, H, [{ x0: 10, y0: 10, x1: 26, y1: 24 }])
    const big = rectPolygon({ x0: 120, y0: 120, x1: 340, y1: 260 })
    expect(snapPolygonToInk(big, data, W, H).region).toBeNull()
  })

  it('refuses a candidate on the far side of the frame', () => {
    const data = sheet(W, H, [{ x0: 300, y0: 220, x1: 380, y1: 280 }])
    const farAway = rectPolygon({ x0: 5, y0: 5, x1: 85, y1: 65 })
    expect(snapPolygonToInk(farAway, data, W, H).region).toBeNull()
  })

  it('handles a degenerate outline without throwing', () => {
    const data = sheet(W, H, [{ x0: 150, y0: 100, x1: 260, y1: 175 }])
    expect(snapPolygonToInk([], data, W, H).points).toEqual([])
    expect(snapPolygonToInk([{ x: 1, y: 1 }], data, W, H).region).toBeNull()
  })
})

describe('inkMask and connectedRegions', () => {
  it('produces a mask that is mostly paper', () => {
    const mask = inkMask(sheet(W, H, [{ x0: 150, y0: 100, x1: 260, y1: 175 }]), W, H)
    const inked = mask.reduce<number>((n, v) => n + v, 0)
    expect(inked).toBeGreaterThan(0)
    expect(inked).toBeLessThan(W * H * 0.5)
  })

  it('does not overflow the stack on a large single region', () => {
    const big = new Uint8Array(600 * 600).fill(1)
    const regions = connectedRegions(big, 600, 600, 1)
    expect(regions).toHaveLength(1)
    expect(regions[0]?.area).toBe(600 * 600)
  })
})
