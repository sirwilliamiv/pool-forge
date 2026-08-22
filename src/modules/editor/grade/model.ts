// The shape of the ground.
//
// Until now the site was implicitly flat at y = 0: a raised deck, a sunken
// patio and the lawn all rendered at the same height, and a yard that falls
// three feet from the house to the back fence could be drawn but not described.
//
// The model is spot elevations rather than contours, because that is what a
// builder actually has: a handful of shots off a laser level, not a survey
// drawing. Contours are derived from the points, never entered.
//
// Pure functions only. Rendering, measurement, pricing and the section cut all
// read from here, so anything wrong here is wrong in four places at once.

/** One measured height on the site. */
export interface GradePoint {
  id: string
  /** Canvas inches, the same coordinates every shape uses. */
  x: number
  y: number
  /** Feet relative to the site datum. Negative is below it. */
  elevationFt: number
  /** What it is: a laser shot, a design intent, a fixed constraint. */
  kind: GradePointKind
  label?: string
}

export type GradePointKind =
  /** Measured on site. Existing ground. */
  | 'existing'
  /** Where the ground is meant to end up after work. */
  | 'finished'
  /** Cannot move: a door threshold, a neighbour's wall, an inlet. */
  | 'fixed'

export interface SiteGrade {
  /** Height everywhere the points do not reach. */
  baseElevationFt: number
  points: GradePoint[]
  /**
   * How strongly a point dominates its surroundings.
   *
   * Two is the usual inverse-square falloff and reads as a natural slope; higher
   * values flatten the field between points and make each one a plateau. Exposed
   * because a graded pad and a natural fall genuinely want different answers.
   */
  falloff: number
  /** Off by default: a flat site is still the common case and costs nothing. */
  enabled: boolean
}

export const DEFAULT_FALLOFF = 2

export function emptyGrade(): SiteGrade {
  return { baseElevationFt: 0, points: [], falloff: DEFAULT_FALLOFF, enabled: false }
}

/**
 * Height of the ground at a point, in feet.
 *
 * Inverse distance weighting rather than a triangulation. A TIN is more correct
 * in the middle of a dense survey and undefined outside its hull, which is
 * exactly where a backyard sketch spends most of its time: three shots near the
 * house and nothing at the fence. This is defined everywhere, degrades to the
 * base elevation when there is nothing to go on, and never produces a cliff at
 * the edge of the data.
 */
export function elevationAt(grade: SiteGrade, x: number, y: number): number {
  if (!grade.enabled || grade.points.length === 0) return grade.baseElevationFt

  let weightedSum = 0
  let weightTotal = 0

  for (const point of grade.points) {
    const dx = x - point.x
    const dy = y - point.y
    const distanceSquared = dx * dx + dy * dy

    // Standing on a known point: return it exactly rather than dividing by zero.
    if (distanceSquared < 1e-9) return point.elevationFt

    const weight = 1 / Math.pow(distanceSquared, grade.falloff / 2)
    weightedSum += weight * point.elevationFt
    weightTotal += weight
  }

  return weightedSum / weightTotal
}

/** Height in canvas inches, for anything positioning geometry. */
export function elevationInchesAt(grade: SiteGrade, x: number, y: number): number {
  return elevationAt(grade, x, y) * 12
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface GradeSample {
  /** Columns and rows of the sampled lattice. */
  cols: number
  rows: number
  /** Spacing in canvas inches. */
  step: number
  origin: { x: number; y: number }
  /** Row-major heights in feet, `cols * rows` long. */
  heights: number[]
}

/**
 * Sample the field onto a lattice, for building a mesh.
 *
 * Step is in inches and clamped, because a 200 foot yard at one-inch spacing is
 * five million samples and would hang the tab rather than render a lawn.
 */
export function sampleGrade(grade: SiteGrade, bounds: Bounds, step: number): GradeSample {
  const spacing = Math.max(12, step)
  const cols = Math.max(2, Math.min(200, Math.ceil(bounds.width / spacing) + 1))
  const rows = Math.max(2, Math.min(200, Math.ceil(bounds.height / spacing) + 1))

  const heights: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      heights.push(elevationAt(grade, bounds.x + col * spacing, bounds.y + row * spacing))
    }
  }

  return { cols, rows, step: spacing, origin: { x: bounds.x, y: bounds.y }, heights }
}

export interface ProfilePoint {
  /** Distance along the cut line, in feet. */
  distanceFt: number
  elevationFt: number
  x: number
  y: number
}

/**
 * The ground along a line, which is what a section drawing is.
 *
 * Section view used to be a side-on camera, which shows the objects from the
 * side but says nothing about the ground they sit on. This is the other half.
 */
export function profileAlong(
  grade: SiteGrade,
  from: { x: number; y: number },
  to: { x: number; y: number },
  samples = 64,
): ProfilePoint[] {
  const count = Math.max(2, Math.min(512, Math.floor(samples)))
  const totalInches = Math.hypot(to.x - from.x, to.y - from.y)

  const profile: ProfilePoint[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const x = from.x + (to.x - from.x) * t
    const y = from.y + (to.y - from.y) * t
    profile.push({
      distanceFt: (totalInches * t) / 12,
      elevationFt: elevationAt(grade, x, y),
      x,
      y,
    })
  }
  return profile
}

export interface CutFill {
  /** Cubic yards to remove. */
  cutYards: number
  /** Cubic yards to bring in. */
  fillYards: number
  /** Positive when more comes out than goes back. */
  netYards: number
  /** Largest drop across the area, in feet. */
  reliefFt: number
}

/**
 * Earthwork between the ground as it is and as it should be.
 *
 * Reported as cut and fill separately, never netted into one number, because
 * they are different jobs with different costs: a yard removed is haulage and a
 * yard added is material, and a site that balances on paper still bills for
 * both.
 */
export function cutFillBetween(
  existing: SiteGrade,
  finished: SiteGrade,
  bounds: Bounds,
  step = 24,
): CutFill {
  const spacing = Math.max(12, step)
  const cols = Math.max(2, Math.min(200, Math.ceil(bounds.width / spacing) + 1))
  const rows = Math.max(2, Math.min(200, Math.ceil(bounds.height / spacing) + 1))

  // Each sample owns a cell of this footprint, in square feet.
  const cellAreaSqft = (spacing / 12) * (spacing / 12)

  let cutCubicFeet = 0
  let fillCubicFeet = 0
  let highest = -Infinity
  let lowest = Infinity

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = bounds.x + col * spacing
      const y = bounds.y + row * spacing
      const before = elevationAt(existing, x, y)
      const after = elevationAt(finished, x, y)

      highest = Math.max(highest, before, after)
      lowest = Math.min(lowest, before, after)

      const difference = after - before
      if (difference < 0) cutCubicFeet += -difference * cellAreaSqft
      else fillCubicFeet += difference * cellAreaSqft
    }
  }

  const cutYards = cutCubicFeet / 27
  const fillYards = fillCubicFeet / 27

  return {
    cutYards: round2(cutYards),
    fillYards: round2(fillYards),
    netYards: round2(cutYards - fillYards),
    reliefFt: Number.isFinite(highest - lowest) ? round2(highest - lowest) : 0,
  }
}

/** Steepest fall anywhere on the site, as a rise over run fraction. */
export function maxSlope(grade: SiteGrade, bounds: Bounds, step = 24): number {
  const sample = sampleGrade(grade, bounds, step)
  const runFt = sample.step / 12
  let steepest = 0

  for (let row = 0; row < sample.rows; row++) {
    for (let col = 0; col < sample.cols; col++) {
      const here = sample.heights[row * sample.cols + col] ?? 0
      const right = col + 1 < sample.cols ? sample.heights[row * sample.cols + col + 1] : undefined
      const down = row + 1 < sample.rows ? sample.heights[(row + 1) * sample.cols + col] : undefined
      if (right !== undefined) steepest = Math.max(steepest, Math.abs(right - here) / runFt)
      if (down !== undefined) steepest = Math.max(steepest, Math.abs(down - here) / runFt)
    }
  }

  return steepest
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
