// Polygon geometry for non-rectangular pools. Points are [x, y] in inches (the
// drawing's world unit). Output units match the rectangle helpers:
//   area -> square feet, perimeter -> linear feet.

const SQ_INCHES_PER_SQ_FOOT = 144
const INCHES_PER_FOOT = 12

export type Point = readonly [number, number]

/** Absolute shoelace area of a closed polygon, in square feet. */
export function polygonAreaSqft(points: readonly Point[]): number {
  const n = points.length
  if (n < 3) return 0
  let twiceArea = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    twiceArea += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(twiceArea) / 2 / SQ_INCHES_PER_SQ_FOOT
}

/** Sum of edge lengths of a closed polygon, in linear feet. */
export function polygonPerimeterLf(points: readonly Point[]): number {
  const n = points.length
  if (n < 2) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    sum += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return sum / INCHES_PER_FOOT
}

/** Axis-aligned bounding box of a set of points (inches). */
export function polygonBoundingBox(points: readonly Point[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
