// The composed precision pass: one call for track I4's review UI.
//
// In goes the coarse polygon the vision model traced, whatever grid the
// detector found, and every scale candidate anyone could read off the image.
// Out comes a cleaned polygon, a resolved scale, and enough per-step
// bookkeeping for the review overlays to explain what changed and why.
//
// Pure: no network, no database, no model. Given the same input it returns the
// same output, which is what makes the numbers on a quote defensible.

import type { Point, Scale } from '../intent'
import type { GridDetection } from './grid'
import {
  fromGrid,
  fromLabeledDimensions,
  fromManual,
  fromScaleBar,
  pickScaleCandidate,
  resolveScale,
  type LabeledDimension,
  type ScaleCandidate,
} from './scale'
import { boundsOf, closeRing, resamplePolygon, simplifyRing, snapToAxis, snapToGrid } from './simplify'

export interface PrecisionOptions {
  /** Douglas-Peucker epsilon in pixels. 0 derives one from the grid or the polygon size. */
  simplifyEpsilonPx: number
  /** Edges within this many degrees of horizontal or vertical are made exact. */
  axisToleranceDeg: number
  /** Vertices within this fraction of a grid pitch snap onto the grid. */
  gridSnapFraction: number
  /** Hard cap on the vertex count handed to the editor. */
  maxPoints: number
}

export const PRECISION_DEFAULTS: PrecisionOptions = {
  simplifyEpsilonPx: 0,
  axisToleranceDeg: 3,
  gridSnapFraction: 0.25,
  maxPoints: 64,
}

export interface ScaleBarReading {
  p1: Point
  p2: Point
  realInches: number
}

export interface ManualCalibration {
  pxDistance: number
  realInches: number
}

export interface PrecisionInput {
  /** The model's coarse trace, in source-image pixels. */
  polygonPx: readonly Point[]
  grid: GridDetection | null
  /** What one grid square is worth, read off the sketch. 12 for "1 sq = 1 ft". */
  gridSquareRealInches: number | null
  labeledDimensions: readonly LabeledDimension[]
  scaleBar: ScaleBarReading | null
  manual: ManualCalibration | null
  options: Partial<PrecisionOptions>
}

export interface PrecisionSteps {
  inputPoints: number
  afterSimplify: number
  afterAxisSnap: number
  afterGridSnap: number
  afterResample: number
  simplifyEpsilonPx: number
  gridSnapped: boolean
}

export interface PrecisionResult {
  /** Cleaned polygon, still in source-image pixels, for drawing overlays. */
  polygonPx: Point[]
  /** The same polygon in intent-frame inches. Null while scale is unresolved. */
  polygonInches: Point[] | null
  scale: Scale
  /** The winning candidate, kept so the review UI can explain the choice. */
  scaleCandidate: ScaleCandidate | null
  /** Every candidate that produced a number, in the order they were considered. */
  scaleCandidates: ScaleCandidate[]
  warnings: string[]
  steps: PrecisionSteps
}

function resolveOptions(options: Partial<PrecisionOptions>): PrecisionOptions {
  return {
    simplifyEpsilonPx: options.simplifyEpsilonPx ?? PRECISION_DEFAULTS.simplifyEpsilonPx,
    axisToleranceDeg: options.axisToleranceDeg ?? PRECISION_DEFAULTS.axisToleranceDeg,
    gridSnapFraction: options.gridSnapFraction ?? PRECISION_DEFAULTS.gridSnapFraction,
    maxPoints: options.maxPoints ?? PRECISION_DEFAULTS.maxPoints,
  }
}

/**
 * Epsilon for the simplification pass.
 *
 * A detected grid gives the honest answer: nothing finer than a fraction of a
 * square is real detail on graph paper. Without one, fall back to a small
 * fraction of the polygon's own diagonal, so the tolerance scales with the
 * drawing rather than with the camera's megapixels.
 */
export function defaultEpsilonPx(points: readonly Point[], grid: GridDetection | null): number {
  if (grid && grid.pitchPx > 0) return Math.max(0.5, grid.pitchPx * 0.15)
  const bounds = boundsOf(points)
  const diagonal = Math.hypot(bounds.width, bounds.height)
  return Math.max(0.5, diagonal * 0.005)
}

/**
 * Clean a coarse polygon and resolve the image scale in one call.
 *
 * The order matters: simplify before snapping, so snapping operates on real
 * corners rather than on trace jitter; axis snap before grid snap, so a run of
 * vertices that share an edge share a coordinate before that coordinate is
 * quantised; resample last, so the cap never discards a corner that snapping
 * was about to make exact.
 */
export function runPrecisionPipeline(input: PrecisionInput): PrecisionResult {
  const opts = resolveOptions(input.options)
  const warnings: string[] = []

  const candidates: ScaleCandidate[] = []
  if (input.grid && input.gridSquareRealInches !== null) {
    const candidate = fromGrid(
      input.grid.pitchPx,
      input.gridSquareRealInches,
      input.grid.confidence,
    )
    if (candidate) candidates.push(candidate)
  } else if (input.grid && input.gridSquareRealInches === null) {
    warnings.push(
      'a grid was detected but nothing said what one square is worth, so the pitch ' +
        'could not be turned into a scale',
    )
  }

  const labeled = fromLabeledDimensions(input.labeledDimensions)
  if (labeled) candidates.push(labeled)
  if (input.scaleBar) {
    const candidate = fromScaleBar(
      input.scaleBar.p1,
      input.scaleBar.p2,
      input.scaleBar.realInches,
    )
    if (candidate) candidates.push(candidate)
  }
  if (input.manual) {
    const candidate = fromManual(input.manual.pxDistance, input.manual.realInches)
    if (candidate) candidates.push(candidate)
  }

  const scaleCandidate = pickScaleCandidate(candidates)
  const scale = resolveScale(candidates)
  if (scaleCandidate) warnings.push(...scaleCandidate.warnings)
  if (scale.pixelsPerInch === null) {
    warnings.push(
      'no usable scale was found, so the polygon stays in pixels; calibrate two points ' +
        'on the image before applying',
    )
  }

  const start = closeRing(input.polygonPx)
  const epsilon =
    opts.simplifyEpsilonPx > 0
      ? opts.simplifyEpsilonPx
      : defaultEpsilonPx(start, input.grid)

  const simplified = simplifyRing(start, epsilon)
  const axisSnapped = snapToAxis(simplified, opts.axisToleranceDeg)

  let gridSnapped = axisSnapped
  let didGridSnap = false
  if (input.grid && input.grid.pitchPx > 0) {
    gridSnapped = snapToGrid(
      axisSnapped,
      input.grid.pitchPx,
      input.grid.originOffsetPx,
      input.grid.pitchPx * opts.gridSnapFraction,
    )
    didGridSnap = true
  }

  const polygonPx = closeRing(resamplePolygon(gridSnapped, opts.maxPoints))
  if (start.length >= 3 && polygonPx.length < 3) {
    warnings.push('cleanup collapsed the traced polygon; the trace was probably degenerate')
  }

  const ppi = scale.pixelsPerInch
  const polygonInches =
    ppi !== null && ppi > 0 ? polygonPx.map((p) => ({ x: p.x / ppi, y: p.y / ppi })) : null

  return {
    polygonPx,
    polygonInches,
    scale,
    scaleCandidate,
    scaleCandidates: candidates,
    warnings,
    steps: {
      inputPoints: start.length,
      afterSimplify: simplified.length,
      afterAxisSnap: axisSnapped.length,
      afterGridSnap: gridSnapped.length,
      afterResample: polygonPx.length,
      simplifyEpsilonPx: epsilon,
      gridSnapped: didGridSnap,
    },
  }
}
