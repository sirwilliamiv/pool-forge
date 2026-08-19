// Intent-frame inches to source-image pixels.
//
// `DesignIntent` footprints are in inches with the origin at the top-left of
// the calibrated frame, which is the same origin the raster uses, so the only
// transform between the two is `scale.pixelsPerInch`. Everything the overlay
// draws goes through here, which is why the overlay stays registered to the
// image: the SVG carries a `viewBox` in raster pixels and the browser applies
// the same zoom and pan transform to both layers.

import type { DesignIntent, Footprint, Point } from '@/modules/imports/intent'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function footprintBounds(footprint: Footprint): Bounds | null {
  const first = footprint.points[0]
  if (!first) return null
  let minX = first.x
  let minY = first.y
  let maxX = first.x
  let maxY = first.y
  for (const point of footprint.points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

/** SVG `points` attribute in raster pixels, or null when unscalable. */
export function footprintToPolygonPoints(
  footprint: Footprint,
  pixelsPerInch: number | null,
): string | null {
  if (pixelsPerInch === null || !(pixelsPerInch > 0)) return null
  return footprint.points
    .map((p: Point) => `${(p.x * pixelsPerInch).toFixed(2)},${(p.y * pixelsPerInch).toFixed(2)}`)
    .join(' ')
}

export type DimensionAxis = 'horizontal' | 'vertical'

export interface DimensionLine {
  id: string
  /** Dotted intent path the line is the visual evidence for. */
  path: string
  axis: DimensionAxis
  x1: number
  y1: number
  x2: number
  y2: number
  /** Midpoint, where the label sits. */
  labelX: number
  labelY: number
  label: string
  /** The value the extractor read, if it read one. */
  readValueFt: number | null
  /** What the drawn span actually measures, from the footprint itself. */
  measuredFt: number
}

function feetLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded} ft` : `${rounded.toFixed(1)} ft`
}

/**
 * Dimension lines drawn over the pool footprint, one per axis. The line is the
 * span the number came from, so a builder can check the read value against the
 * thing it was read off rather than trusting it.
 */
export function poolDimensionLines(
  intent: DesignIntent,
  pixelsPerInch: number | null,
): DimensionLine[] {
  const footprint = intent.pool.footprint
  if (!footprint || pixelsPerInch === null || !(pixelsPerInch > 0)) return []
  const bounds = footprintBounds(footprint)
  if (!bounds) return []

  const left = bounds.minX * pixelsPerInch
  const right = bounds.maxX * pixelsPerInch
  const top = bounds.minY * pixelsPerInch
  const bottom = bounds.maxY * pixelsPerInch

  const measuredLengthFt = (bounds.maxX - bounds.minX) / 12
  const measuredWidthFt = (bounds.maxY - bounds.minY) / 12
  const gap = Math.max(8, (bottom - top) * 0.08)

  const lines: DimensionLine[] = [
    {
      id: 'dim-pool-length',
      path: 'pool.lengthFt',
      axis: 'horizontal',
      x1: left,
      y1: bottom + gap,
      x2: right,
      y2: bottom + gap,
      labelX: (left + right) / 2,
      labelY: bottom + gap,
      label: feetLabel(intent.pool.lengthFt ?? measuredLengthFt),
      readValueFt: intent.pool.lengthFt,
      measuredFt: measuredLengthFt,
    },
    {
      id: 'dim-pool-width',
      path: 'pool.widthFt',
      axis: 'vertical',
      x1: left - gap,
      y1: top,
      x2: left - gap,
      y2: bottom,
      labelX: left - gap,
      labelY: (top + bottom) / 2,
      label: feetLabel(intent.pool.widthFt ?? measuredWidthFt),
      readValueFt: intent.pool.widthFt,
      measuredFt: measuredWidthFt,
    },
  ]

  return lines
}

/**
 * A dimension line whose read value disagrees with the span it was drawn from
 * is the single most useful thing this screen can point at. Five percent is
 * the same tolerance the extraction cross-check uses.
 */
export const DIMENSION_DISAGREEMENT_TOLERANCE = 0.05

export function dimensionDisagrees(line: DimensionLine): boolean {
  if (line.readValueFt === null || line.measuredFt <= 0) return false
  const delta = Math.abs(line.readValueFt - line.measuredFt) / line.measuredFt
  return delta > DIMENSION_DISAGREEMENT_TOLERANCE
}

export interface GridOverlay {
  /** Raster-pixel x positions of the vertical rules. */
  vertical: number[]
  /** Raster-pixel y positions of the horizontal rules. */
  horizontal: number[]
  spacingPx: number
  /** True when the pitch is too fine to draw legibly at any zoom. */
  tooDense: boolean
}

/** Below this the rules merge into a grey wash and stop being evidence. */
const MIN_LEGIBLE_GRID_PX = 6
const MAX_GRID_LINES = 400

/**
 * A one-foot grid derived from the resolved scale. Drawn over the paper grid
 * on a sketch, it is the fastest possible check that the calibration is right:
 * if the derived rules do not sit on the printed squares, the scale is wrong.
 */
export function gridOverlay(
  widthPx: number,
  heightPx: number,
  pixelsPerInch: number | null,
  spacingInches = 12,
): GridOverlay | null {
  if (pixelsPerInch === null || !(pixelsPerInch > 0) || spacingInches <= 0) return null
  const spacingPx = pixelsPerInch * spacingInches
  if (spacingPx < MIN_LEGIBLE_GRID_PX) {
    return { vertical: [], horizontal: [], spacingPx, tooDense: true }
  }
  const vertical: number[] = []
  const horizontal: number[] = []
  for (let x = spacingPx; x < widthPx && vertical.length < MAX_GRID_LINES; x += spacingPx) {
    vertical.push(x)
  }
  for (let y = spacingPx; y < heightPx && horizontal.length < MAX_GRID_LINES; y += spacingPx) {
    horizontal.push(y)
  }
  return { vertical, horizontal, spacingPx, tooDense: false }
}

export interface CalibrationPoint {
  x: number
  y: number
}

/** Straight-line distance between the two calibration clicks, in raster px. */
export function calibrationPxDistance(a: CalibrationPoint, b: CalibrationPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Same semantics as `calibrationPxDistance` / `calibrationRealInches` in
 * `surveyStore`: the user marks a span they know the real length of, and the
 * ratio is the scale. Null whenever the inputs cannot produce an honest one.
 */
export function pixelsPerInchFrom(pxDistance: number, realInches: number): number | null {
  if (!Number.isFinite(pxDistance) || !Number.isFinite(realInches)) return null
  if (pxDistance <= 0 || realInches <= 0) return null
  return pxDistance / realInches
}

/** Feet and inches typed as a single field: "12", "12.5", "12' 6", "12 ft 6 in". */
export function parseRealDistanceInches(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const compound = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|in|inches)?$/i.exec(
    trimmed,
  )
  if (compound) {
    const feetPart = compound[1]
    const inchPart = compound[2]
    const feet = feetPart === undefined ? 0 : Number(feetPart)
    const inches = inchPart === undefined ? 0 : Number(inchPart)
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null
    const total = feet * 12 + inches
    return total > 0 ? total : null
  }

  const inchesOnly = /^(\d+(?:\.\d+)?)\s*(?:"|in|inches)$/i.exec(trimmed)
  if (inchesOnly) {
    const raw2 = inchesOnly[1]
    const value = raw2 === undefined ? NaN : Number(raw2)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  // Bare numbers are feet: it is the unit a builder speaks in.
  const bare = Number(trimmed)
  if (!Number.isFinite(bare) || bare <= 0) return null
  return bare * 12
}

/**
 * Converts a pointer event's client coordinates into raster-pixel coordinates,
 * independent of the current zoom and pan: the rendered rect already carries
 * the transform, so the ratio between it and the natural size is the transform.
 */
export function clientToRasterPoint(args: {
  clientX: number
  clientY: number
  rect: { left: number; top: number; width: number; height: number }
  naturalWidthPx: number
  naturalHeightPx: number
}): CalibrationPoint | null {
  if (args.rect.width <= 0 || args.rect.height <= 0) return null
  const fx = (args.clientX - args.rect.left) / args.rect.width
  const fy = (args.clientY - args.rect.top) / args.rect.height
  return {
    x: fx * args.naturalWidthPx,
    y: fy * args.naturalHeightPx,
  }
}
