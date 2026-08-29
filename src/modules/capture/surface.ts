// A walked heightfield becoming the ground the rest of the app already knows.
//
// The design decision, argued because it is the one that matters:
//
// `SiteGrade` is spot elevations interpolated by inverse distance weighting,
// and six other places read it - `elevationAt` under every object, the terrain
// mesh, the section profile, `maxSlope`, `cutFillBetween`, and the grade panel
// the builder types into. A dense surface bolted onto `SiteGrade` would be a
// second branch in all six, and "the whole existing chain works with no special
// cases" is exactly the requirement it would fail. It would also be unusable:
// `cutFillBetween` samples up to 40,000 points, and inverse distance weighting
// against 60,000 shots at each of them is 2.4 billion distance calculations for
// one earthwork figure that is recomputed on every keystroke in the panel.
//
// So the capture is decimated to the shots that reconstruct it, and the shots
// are ordinary `GradePoint`s. Nothing downstream changes at all.
//
// Decimation is error-driven rather than a stride. Taking every fiftieth cell
// samples a swale wherever the stride happens to land and misses the bottom of
// it, which is the one part of the yard that decides the dig. Instead: start
// from the extremes, repeatedly add the measured cell the current shots get
// most wrong, and stop when the worst remaining error is smaller than the
// laser a builder would have used anyway.
//
// Two rules the decimation never breaks:
//   - Only measured cells become shots. Ground nobody walked never becomes a
//     survey shot, because a shot is a claim that somebody stood there.
//   - The benchmark tap is always a shot. It is the one height on site that is
//     not an estimate.

import {
  DEFAULT_FALLOFF,
  elevationAt,
  type CaptureProvenance,
  type GradePoint,
  type SiteGrade,
} from '@/modules/editor/grade/model'

import { isMeasured, type CoverageReport } from './coverage'
import type { Heightfield } from './contract'

/**
 * How many shots a capture is allowed to leave behind.
 *
 * Sixty-four is far more than a builder would ever take by hand and still cheap
 * for every consumer: `cutFillBetween` at its default spacing is 40,000 samples
 * against 64 shots, which is under three million operations.
 */
export const DEFAULT_MAX_SHOTS = 64

/**
 * Good enough to stop adding shots, in feet.
 *
 * Six tenths of an inch. A rotary laser reads to about an eighth of an inch and
 * the person holding the rod is worth rather less than that, so a surface that
 * agrees with the walk to this tolerance is agreeing to inside the noise.
 */
export const DEFAULT_TOLERANCE_FT = 0.05

/**
 * Cells the greedy search looks at.
 *
 * The search is quadratic in the number of shots and linear in candidates, so
 * candidates are strided down to this before it starts. The stride is uniform,
 * which is safe here in a way it would not be as the decimation itself: it
 * decides only which cells get a vote, and a swale sampled every third cell is
 * still obviously a swale.
 */
const CANDIDATE_BUDGET = 2_500

export interface DecimateOptions {
  maxShots?: number
  toleranceFt?: number
}

export interface Decimation {
  points: GradePoint[]
  /**
   * The worst the reconstruction is wrong across the candidates, in feet.
   *
   * Reported rather than hidden: it is the honest answer to "how close is this
   * surface to what the phone actually saw", and it belongs next to the shots.
   */
  maxErrorFt: number
  candidatesConsidered: number
}

/** Stable ids, so re-uploading the same walk does not duplicate the survey. */
function shotId(captureId: string, index: number): string {
  return `cap-${captureId.slice(4, 12)}-${index}`
}

/**
 * One measured cell, positioned relative to the capture's own origin.
 *
 * Local rather than absolute on purpose. The greedy search compares
 * reconstruction errors, and comparing floating-point errors computed from
 * coordinates a few hundred inches further out picks a different worst cell for
 * the same yard: moving a capture across the drawing quietly changed which
 * shots it left behind. Where the capture sits on the page is not information
 * about the ground, so the search never sees it, and the origin is added back
 * once at the end.
 */
interface Candidate {
  index: number
  localX: number
  localY: number
  elevationFt: number
}

function candidatesOf(field: Heightfield): Candidate[] {
  const measured: number[] = []
  for (let i = 0; i < field.coverage.length; i++) if (isMeasured(field, i)) measured.push(i)

  const stride = Math.max(1, Math.ceil(measured.length / CANDIDATE_BUDGET))
  const out: Candidate[] = []
  for (let i = 0; i < measured.length; i += stride) {
    const index = measured[i]
    if (index === undefined) continue
    const col = index % field.cols
    const row = (index - col) / field.cols
    out.push({
      index,
      localX: col * field.cellSizeIn,
      localY: row * field.cellSizeIn,
      elevationFt: field.elevationsFt[index] ?? field.datumFt,
    })
  }
  return out
}

/** The measured cells nearest each corner and each elevation extreme. */
function seeds(candidates: Candidate[]): Candidate[] {
  if (candidates.length === 0) return []
  const first = candidates[0]!
  let minX = first
  let maxX = first
  let minY = first
  let maxY = first
  let low = first
  let high = first

  for (const c of candidates) {
    if (c.localX < minX.localX) minX = c
    if (c.localX > maxX.localX) maxX = c
    if (c.localY < minY.localY) minY = c
    if (c.localY > maxY.localY) maxY = c
    if (c.elevationFt < low.elevationFt) low = c
    if (c.elevationFt > high.elevationFt) high = c
  }

  // The two elevation extremes matter as much as the corners: the model never
  // extrapolates past the range of its shots, so leaving the low point out
  // means the bottom of the swale can never be reached however many other
  // shots are taken, and the dig is under-quoted by exactly that depth.
  const picked: Candidate[] = []
  for (const c of [minX, maxX, minY, maxY, low, high]) {
    if (!picked.some(p => p.index === c.index)) picked.push(c)
  }
  return picked
}

/**
 * Choose the shots that reconstruct this capture.
 *
 * Greedy worst-first. Each round asks the surface built from the shots so far
 * what it thinks the ground is at every candidate, and promotes whichever one
 * it is most wrong about.
 */
export function decimateToShots(field: Heightfield, options: DecimateOptions = {}): Decimation {
  const maxShots = Math.max(2, Math.floor(options.maxShots ?? DEFAULT_MAX_SHOTS))
  const tolerance = Math.max(0, options.toleranceFt ?? DEFAULT_TOLERANCE_FT)

  const candidates = candidatesOf(field)
  if (candidates.length === 0) {
    return { points: [], maxErrorFt: 0, candidatesConsidered: 0 }
  }

  const chosen: Candidate[] = seeds(candidates).slice(0, maxShots)
  let maxErrorFt = 0

  for (;;) {
    const surface = surfaceOf(field, chosen)
    let worst: Candidate | null = null
    let worstError = 0

    for (const c of candidates) {
      const error = Math.abs(elevationAt(surface, c.localX, c.localY) - c.elevationFt)
      if (error > worstError) {
        worstError = error
        worst = c
      }
    }

    maxErrorFt = worstError
    if (worst === null || worstError <= tolerance || chosen.length >= maxShots) break
    chosen.push(worst)
  }

  const points: GradePoint[] = chosen.map(c => ({
    id: shotId(field.captureId, c.index),
    x: field.originXIn + c.localX,
    y: field.originYIn + c.localY,
    elevationFt: c.elevationFt,
    kind: 'existing',
  }))

  return { points, maxErrorFt, candidatesConsidered: candidates.length }
}

/** A scratch surface over a working set of shots, in local coordinates. */
function surfaceOf(field: Heightfield, chosen: Candidate[]): SiteGrade {
  return {
    baseElevationFt: field.datumFt,
    falloff: DEFAULT_FALLOFF,
    enabled: true,
    points: chosen.map(c => ({
      id: String(c.index),
      x: c.localX,
      y: c.localY,
      elevationFt: c.elevationFt,
      kind: 'existing' as const,
    })),
  }
}

/** The benchmark tap, as the shot it is. */
export function benchmarkShot(field: Heightfield): GradePoint {
  const point: GradePoint = {
    id: `cap-${field.captureId.slice(4, 12)}-benchmark`,
    x: field.benchmarkXIn,
    y: field.benchmarkYIn,
    elevationFt: field.datumFt,
    // 'fixed' rather than 'existing': it is a height that cannot move, in the
    // same sense a door threshold cannot. Re-benchmarking is a new capture.
    kind: 'fixed',
  }
  const label = field.benchmarkLabel
  if (label !== null) point.label = label
  return point
}

export interface ExistingSurfaceResult {
  grade: SiteGrade
  /** Shots the capture contributed, benchmark included. */
  shotCount: number
  /** Hand-set constraints kept from before, which a walk does not overrule. */
  keptFixed: number
  /** Typed shots the walk superseded. */
  replaced: number
  /**
   * The worst this surface disagrees with the ground the phone walked, in feet.
   *
   * Measured against the assembled surface rather than taken from the greedy
   * loop, because the assembled one carries the benchmark and any hand-set
   * constraints too, and it is the one every consumer will read. A number the
   * app publishes about its own accuracy has to be about the thing it shipped.
   *
   * Inverse distance weighting is a smoother, so a narrow drainage swale or the
   * face of a slab is rounded off and this number goes up accordingly. That is
   * a property of the surface model the whole app already uses, not of the
   * decimation, and reporting it is the only honest thing to do about it.
   */
  maxErrorFt: number
}

/**
 * Build the existing surface a capture implies.
 *
 * A walked survey supersedes typed guesses about the same ground, so the
 * existing surface's shots are replaced rather than merged: two surveys of one
 * yard averaged together is a third yard that matches neither. Points marked
 * `fixed` survive, because they are not guesses about the ground - they are
 * constraints somebody entered on purpose, a door sill or a neighbour's wall,
 * and no amount of walking changes where those are.
 *
 * The datum comes from the benchmark tap. `baseElevationFt` is the height of
 * ground nobody measured, which is precisely what the tap establishes.
 */
export function existingSurfaceFrom(
  field: Heightfield,
  previous: SiteGrade | null,
  options: DecimateOptions = {},
): ExistingSurfaceResult {
  const decimation = decimateToShots(field, options)
  const kept = (previous?.points ?? []).filter(point => point.kind === 'fixed')
  const replacedCount = (previous?.points ?? []).length - kept.length

  const benchmark = benchmarkShot(field)
  // The benchmark is 'fixed', so a re-ingest would otherwise keep the previous
  // capture's benchmark alongside the new one and leave two datums on the site.
  const keptWithoutStaleBenchmarks = kept.filter(point => !point.id.endsWith('-benchmark'))

  const points = [benchmark, ...keptWithoutStaleBenchmarks, ...decimation.points]

  const grade: SiteGrade = {
    baseElevationFt: field.datumFt,
    falloff: previous?.falloff ?? DEFAULT_FALLOFF,
    enabled: true,
    points,
  }

  return {
    grade,
    shotCount: decimation.points.length + 1,
    keptFixed: keptWithoutStaleBenchmarks.length,
    replaced: replacedCount,
    maxErrorFt: reconstructionError(field, grade).maxFt,
  }
}

/**
 * Move a capture onto the drawing.
 *
 * Translation only, deliberately. Rotating a capture to a compass heading is an
 * alignment decision against a plan that may already be square to the street,
 * and doing it silently on ingest would turn a yard under a drawing nobody
 * asked to move. The heading the phone recorded is kept on the payload for
 * whoever builds that alignment step.
 */
export function placeHeightfield(
  field: Heightfield,
  anchor: { xIn: number; yIn: number },
): Heightfield {
  return {
    ...field,
    originXIn: field.originXIn + anchor.xIn,
    originYIn: field.originYIn + anchor.yIn,
    benchmarkXIn: field.benchmarkXIn + anchor.xIn,
    benchmarkYIn: field.benchmarkYIn + anchor.yIn,
  }
}

export interface ReconstructionError {
  maxFt: number
  meanFt: number
  samples: number
}

/**
 * How far the decimated surface is from the ground the phone actually saw.
 *
 * Measured over the walked cells only. Asking how well the surface reproduces
 * ground nobody walked is a question with no true answer, and answering it
 * anyway is the mistake this whole feature exists to stop.
 */
export function reconstructionError(field: Heightfield, grade: SiteGrade): ReconstructionError {
  const candidates = candidatesOf(field)
  if (candidates.length === 0) return { maxFt: 0, meanFt: 0, samples: 0 }

  let max = 0
  let total = 0
  for (const c of candidates) {
    const error = Math.abs(
      elevationAt(grade, field.originXIn + c.localX, field.originYIn + c.localY) - c.elevationFt,
    )
    if (error > max) max = error
    total += error
  }

  return { maxFt: max, meanFt: total / candidates.length, samples: candidates.length }
}

/**
 * The small block of provenance that rides along on the surface.
 *
 * Kept separate from the capture row on purpose: the row holds 300KB of mask
 * and lives in Postgres, and the panel that prints a cut and fill needs eight
 * numbers and no round trip. This is those eight numbers.
 */
export function provenanceFrom(
  field: Heightfield,
  report: CoverageReport,
  result: Pick<ExistingSurfaceResult, 'shotCount' | 'maxErrorFt'>,
): CaptureProvenance {
  return {
    captureId: field.captureId,
    capturedAt: field.capturedAt,
    measuredFraction: report.fraction,
    gapAreaSqft: report.gapAreaSqft,
    largestGapSqft: report.largestGapSqft,
    shotCount: result.shotCount,
    maxErrorFt: Math.round(result.maxErrorFt * 1_000) / 1_000,
    benchmarkLabel: field.benchmarkLabel,
  }
}
