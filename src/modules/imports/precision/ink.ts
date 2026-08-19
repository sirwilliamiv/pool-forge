// Snapping a model-supplied outline onto the marks actually on the paper.
//
// Vision models are reliable about *what* a shape is and unreliable about
// *where* it sits: on a real photo the pool outline came back the right size
// and shape but offset from the drawing by a fifth of the frame. Prompting does
// not fix that, and it is not supposed to. The design splits the work so the
// model reads semantics and deterministic code produces every number, and this
// is the step that makes the second half true for position as well as scale.
//
// The key observation is that a pool on a hand sketch is nearly always filled:
// shaded, hatched, or coloured in. Grid rules and pen outlines are one or two
// pixels wide, so a single erosion pass deletes them while a solid fill
// survives. What is left is exactly the set of filled shapes, which is what the
// extraction prompt tells the model to look for.

export interface Point {
  x: number
  y: number
}

export interface InkRegion {
  /** Pixel bounds of the filled area. */
  minX: number
  minY: number
  maxX: number
  maxY: number
  area: number
  centroid: Point
}

export interface InkOptions {
  /**
   * Half-width of the local-mean window, in pixels. Zero means derive it from
   * the image, which is almost always what you want.
   */
  windowPx: number
  /** How far below the local mean a pixel must sit to count as ink, 0..1. */
  darknessFraction: number
  /** Erosion passes. One removes single-pixel rules; two removes heavier ones. */
  erosionPasses: number
  /** Regions smaller than this share of the frame are discarded as noise. */
  minAreaFraction: number
}

export const INK_DEFAULTS: InkOptions = {
  windowPx: 0,
  darknessFraction: 0.14,
  erosionPasses: 2,
  minAreaFraction: 0.0008,
}

/**
 * The window must be larger than the shapes being found. A local mean taken
 * over a window smaller than a filled rectangle is dominated by that rectangle,
 * so its interior reads as its own background and the shape disappears. That is
 * exactly what happened with a fixed 24px window: the pool went undetected
 * while thin grid lines were found perfectly.
 */
export function autoWindowPx(width: number, height: number): number {
  return Math.max(24, Math.round(Math.min(width, height) / 10))
}

function resolve(options: Partial<InkOptions>, width: number, height: number): InkOptions {
  const merged = { ...INK_DEFAULTS, ...options }
  return merged.windowPx > 0 ? merged : { ...merged, windowPx: autoWindowPx(width, height) }
}

/**
 * Ink mask by local-mean thresholding.
 *
 * Local rather than global because a phone photo of paper on a couch has a
 * lighting gradient across it: one global threshold either loses the drawing in
 * the shadowed corner or floods the lit one.
 */
export function inkMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Partial<InkOptions> = {},
): Uint8Array {
  const opts = resolve(options, width, height)
  const mask = new Uint8Array(width * height)
  if (width < 3 || height < 3) return mask

  // Summed-area table, so each local mean is O(1) regardless of window size.
  const sums = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x] ?? 0
      const above = sums[y * (width + 1) + (x + 1)] ?? 0
      sums[(y + 1) * (width + 1) + (x + 1)] = above + rowSum
    }
  }

  const areaMean = (x0: number, y0: number, x1: number, y1: number): number => {
    const a = sums[y0 * (width + 1) + x0] ?? 0
    const b = sums[y0 * (width + 1) + x1] ?? 0
    const c = sums[y1 * (width + 1) + x0] ?? 0
    const d = sums[y1 * (width + 1) + x1] ?? 0
    const count = (x1 - x0) * (y1 - y0)
    return count > 0 ? (d - b - c + a) / count : 0
  }

  const w = Math.max(2, Math.floor(opts.windowPx))
  const cutoff = opts.darknessFraction * 255

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - w)
    const y1 = Math.min(height, y + w + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - w)
      const x1 = Math.min(width, x + w + 1)
      const value = data[y * width + x] ?? 0
      if (areaMean(x0, y0, x1, y1) - value > cutoff) mask[y * width + x] = 1
    }
  }
  return mask
}

/**
 * Erode by one pixel, 4-connected. This is the step that separates a filled
 * shape from the grid it is drawn on: a one-pixel rule has no interior and
 * disappears, a shaded rectangle loses only its border.
 */
export function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (
        mask[i] === 1 &&
        mask[i - 1] === 1 &&
        mask[i + 1] === 1 &&
        mask[i - width] === 1 &&
        mask[i + width] === 1
      ) {
        out[i] = 1
      }
    }
  }
  return out
}

/**
 * Connected components, 4-connected, via an explicit stack.
 *
 * Iterative rather than recursive because a filled region on a 12MP photo can
 * run to millions of pixels and a recursive flood fill overflows the stack.
 */
export function connectedRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): InkRegion[] {
  const seen = new Uint8Array(mask.length)
  const regions: InkRegion[] = []
  const stack: number[] = []

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue

    stack.length = 0
    stack.push(start)
    seen[start] = 1

    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    while (stack.length > 0) {
      const i = stack.pop() as number
      const x = i % width
      const y = (i - x) / width

      area += 1
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      if (x > 0 && mask[i - 1] === 1 && seen[i - 1] === 0) { seen[i - 1] = 1; stack.push(i - 1) }
      if (x < width - 1 && mask[i + 1] === 1 && seen[i + 1] === 0) { seen[i + 1] = 1; stack.push(i + 1) }
      if (y > 0 && mask[i - width] === 1 && seen[i - width] === 0) { seen[i - width] = 1; stack.push(i - width) }
      if (y < height - 1 && mask[i + width] === 1 && seen[i + width] === 0) { seen[i + width] = 1; stack.push(i + width) }
    }

    if (area >= minArea) {
      regions.push({ minX, minY, maxX, maxY, area, centroid: { x: sumX / area, y: sumY / area } })
    }
  }

  return regions.sort((a, b) => b.area - a.area)
}

/** Filled regions in an image, largest first. */
export function findFilledRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Partial<InkOptions> = {},
): InkRegion[] {
  const opts = resolve(options, width, height)
  let mask = inkMask(data, width, height, opts)
  for (let pass = 0; pass < opts.erosionPasses; pass++) {
    mask = erode(mask, width, height)
  }
  return connectedRegions(mask, width, height, Math.floor(opts.minAreaFraction * width * height))
}

function bounds(points: readonly Point[]): InkRegion | null {
  const first = points[0]
  if (!first) return null
  let minX = first.x
  let maxX = first.x
  let minY = first.y
  let maxY = first.y
  let sumX = 0
  let sumY = 0
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    sumX += p.x
    sumY += p.y
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    area: Math.max(1, (maxX - minX) * (maxY - minY)),
    centroid: { x: sumX / points.length, y: sumY / points.length },
  }
}

export interface SnapResult {
  points: Point[]
  /** Null when nothing was snapped and the input passed through unchanged. */
  region: InkRegion | null
  /** How far the polygon moved, as a fraction of the frame's diagonal. */
  movedFraction: number
}

export interface SnapOptions extends InkOptions {
  /**
   * Reject a candidate whose area differs from the model's by more than this
   * ratio either way. Guards against snapping a pool onto a stray blob.
   */
  maxAreaRatio: number
  /** Reject a candidate whose centroid is further than this share of the diagonal. */
  maxCentroidFraction: number
}

export const SNAP_DEFAULTS: SnapOptions = {
  ...INK_DEFAULTS,
  maxAreaRatio: 6,
  maxCentroidFraction: 0.45,
}

/**
 * Move a model-supplied polygon onto the filled region it was describing.
 *
 * The polygon's shape is preserved and only its bounding box is fitted, because
 * the model's *proportions* are trustworthy and its *placement* is not. A
 * candidate must be both near enough and similar enough in area, so a wrong
 * guess passes the original through untouched rather than snapping onto
 * whatever happened to be closest.
 */
export function snapPolygonToInk(
  polygonPx: readonly Point[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Partial<SnapOptions> = {},
): SnapResult {
  const opts: SnapOptions = { ...SNAP_DEFAULTS, ...options }
  const source = bounds(polygonPx)
  if (!source || polygonPx.length < 3) {
    return { points: [...polygonPx], region: null, movedFraction: 0 }
  }

  const regions = findFilledRegions(data, width, height, opts)
  if (regions.length === 0) return { points: [...polygonPx], region: null, movedFraction: 0 }

  const diagonal = Math.hypot(width, height)
  const sourceArea = Math.max(1, (source.maxX - source.minX) * (source.maxY - source.minY))

  let best: InkRegion | null = null
  let bestDistance = Infinity
  for (const region of regions) {
    const regionArea = Math.max(1, (region.maxX - region.minX) * (region.maxY - region.minY))
    const ratio = regionArea > sourceArea ? regionArea / sourceArea : sourceArea / regionArea
    if (ratio > opts.maxAreaRatio) continue

    const distance = Math.hypot(
      region.centroid.x - source.centroid.x,
      region.centroid.y - source.centroid.y,
    )
    if (distance / diagonal > opts.maxCentroidFraction) continue
    if (distance < bestDistance) {
      bestDistance = distance
      best = region
    }
  }

  if (!best) return { points: [...polygonPx], region: null, movedFraction: 0 }

  const srcW = Math.max(1e-6, source.maxX - source.minX)
  const srcH = Math.max(1e-6, source.maxY - source.minY)
  const dstW = best.maxX - best.minX
  const dstH = best.maxY - best.minY

  const points = polygonPx.map(p => ({
    x: best.minX + ((p.x - source.minX) / srcW) * dstW,
    y: best.minY + ((p.y - source.minY) / srcH) * dstH,
  }))

  return { points, region: best, movedFraction: bestDistance / diagonal }
}
