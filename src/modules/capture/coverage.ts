// How much of this ground did anybody actually walk?
//
// The reason the whole feature is worth building. A DEM interpolates everywhere,
// including across the stripe the person skipped because the shed was in the
// way, and the interpolated ground looks exactly like the measured ground: same
// mesh, same contours, same cut and fill on the quote. The coverage mask is the
// only thing that knows the difference, and this module is the only thing that
// reads it out loud.
//
// The app already says "drawn but not priced" rather than quietly pricing a
// deck at zero, and "no price book, so this cannot be priced" rather than
// showing a total of nothing. This is the same sentence for dirt: a number
// derived from ground nobody surveyed says so, in the place the number is
// shown, every time.

import type { Bounds } from '@/modules/editor/grade/model'

import { MEASURED_COVERAGE_MIN, type Heightfield } from './contract'

/**
 * Ceiling on samples in one report.
 *
 * The report runs on every render of the grade panel. Two hundred thousand
 * samples of integer arithmetic is a few milliseconds; a region the size of a
 * county at 4-inch spacing is not, so the sample step coarsens instead. The
 * fractions are unchanged by coarsening because they are ratios of the same
 * lattice.
 */
const MAX_REPORT_SAMPLES = 200_000

export interface CoverageReport {
  /** Samples in the region. Zero when the region has no area. */
  totalSamples: number
  measuredSamples: number
  /** 0 to 1. One means every square foot of the region was walked. */
  fraction: number
  areaSqft: number
  measuredAreaSqft: number
  /** Ground in the region nobody measured. The honest part. */
  gapAreaSqft: number
  /**
   * The biggest single hole, as one connected piece.
   *
   * Ten percent missing in a fringe around the edge of the capture is a survey
   * that is fine. Ten percent missing as one hole in the middle of the pool is
   * a survey that has to be walked again, and the two are the same percentage.
   */
  largestGapSqft: number
  /** True when nothing in the region is being interpolated across a gap. */
  complete: boolean
}

export const EMPTY_COVERAGE: CoverageReport = {
  totalSamples: 0,
  measuredSamples: 0,
  fraction: 0,
  areaSqft: 0,
  measuredAreaSqft: 0,
  gapAreaSqft: 0,
  largestGapSqft: 0,
  complete: false,
}

/** The full extent of a capture, in the coordinates its cells are placed at. */
export function fieldBounds(field: Heightfield): Bounds {
  // Cells are addressed by their centres, so the ground the capture covers runs
  // half a cell past the outermost centre in each direction.
  const half = field.cellSizeIn / 2
  return {
    x: field.originXIn - half,
    y: field.originYIn - half,
    width: (field.cols - 1) * field.cellSizeIn + field.cellSizeIn,
    height: (field.rows - 1) * field.cellSizeIn + field.cellSizeIn,
  }
}

/** Was this cell measured, or is it ground nobody walked? */
export function isMeasured(field: Heightfield, index: number): boolean {
  const cover = field.coverage[index]
  return cover !== undefined && cover >= MEASURED_COVERAGE_MIN
}

/** How many cells in the whole capture were actually measured. */
export function measuredCellCount(field: Heightfield): number {
  let count = 0
  for (let i = 0; i < field.coverage.length; i++) if (isMeasured(field, i)) count += 1
  return count
}

/**
 * Coverage over a region of interest: the pool footprint, the deck, the lot.
 *
 * The region is rasterised on its own lattice rather than the capture's, so
 * ground the walk never reached at all counts as a gap. A pool drawn ten feet
 * past the edge of the capture is ten feet of unmeasured ground, and reporting
 * only over the overlap would call that survey complete.
 */
export function coverageOver(field: Heightfield, region: Bounds | null): CoverageReport {
  const area = region ?? fieldBounds(field)
  if (!(area.width > 0) || !(area.height > 0)) return { ...EMPTY_COVERAGE }

  // Start at the capture's own resolution: anything finer measures nothing new,
  // because the mask has no detail below one cell.
  let step = field.cellSizeIn
  let cols = Math.max(1, Math.round(area.width / step))
  let rows = Math.max(1, Math.round(area.height / step))
  while (cols * rows > MAX_REPORT_SAMPLES) {
    step *= 2
    cols = Math.max(1, Math.round(area.width / step))
    rows = Math.max(1, Math.round(area.height / step))
  }

  const measuredAt = new Uint8Array(cols * rows)
  let measuredSamples = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = area.x + (col + 0.5) * (area.width / cols)
      const y = area.y + (row + 0.5) * (area.height / rows)
      if (sampleIsMeasured(field, x, y)) {
        measuredAt[row * cols + col] = 1
        measuredSamples += 1
      }
    }
  }

  const total = cols * rows
  const sampleAreaSqft = (area.width / cols / 12) * (area.height / rows / 12)
  const gapSamples = total - measuredSamples

  return {
    totalSamples: total,
    measuredSamples,
    fraction: total === 0 ? 0 : measuredSamples / total,
    areaSqft: round1(total * sampleAreaSqft),
    measuredAreaSqft: round1(measuredSamples * sampleAreaSqft),
    gapAreaSqft: round1(gapSamples * sampleAreaSqft),
    largestGapSqft: round1(largestGapSamples(measuredAt, cols, rows) * sampleAreaSqft),
    complete: gapSamples === 0,
  }
}

/** Does the capture have a measured cell under this point? */
function sampleIsMeasured(field: Heightfield, x: number, y: number): boolean {
  const col = Math.round((x - field.originXIn) / field.cellSizeIn)
  const row = Math.round((y - field.originYIn) / field.cellSizeIn)
  if (col < 0 || col >= field.cols || row < 0 || row >= field.rows) return false
  return isMeasured(field, row * field.cols + col)
}

/**
 * The largest connected run of unmeasured samples, four-connected.
 *
 * Iterative rather than recursive: a 200,000-sample gap would blow the stack,
 * and the one case this has to survive is a capture where the person walked
 * almost none of it.
 */
function largestGapSamples(measuredAt: Uint8Array, cols: number, rows: number): number {
  const seen = new Uint8Array(cols * rows)
  const stack: number[] = []
  let largest = 0

  for (let start = 0; start < measuredAt.length; start++) {
    if (measuredAt[start] === 1 || seen[start] === 1) continue
    seen[start] = 1
    stack.length = 0
    stack.push(start)
    let size = 0

    while (stack.length > 0) {
      const index = stack.pop()
      if (index === undefined) break
      size += 1
      const col = index % cols
      const row = (index - col) / cols

      const neighbours = [
        col > 0 ? index - 1 : -1,
        col + 1 < cols ? index + 1 : -1,
        row > 0 ? index - cols : -1,
        row + 1 < rows ? index + cols : -1,
      ]
      for (const next of neighbours) {
        if (next < 0) continue
        if (seen[next] === 1 || measuredAt[next] === 1) continue
        seen[next] = 1
        stack.push(next)
      }
    }

    if (size > largest) largest = size
  }

  return largest
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// ---------------------------------------------------------------------------
// Saying it out loud.
//
// The app's existing voice for a number it cannot stand behind: "Drawn but not
// priced", "No price book, so this cannot be priced." Never a silent zero and
// never a confident guess. These are the same sentences for ground.

/**
 * What is shown where nothing has been captured at all.
 *
 * A flat existing surface is a real answer - most sites are flat enough - but
 * it is a typed answer, not a measured one, and a cut and fill built on it is
 * only as good as the person who typed it.
 */
export const NO_CAPTURE_NOTE =
  'No site capture. The existing ground is whatever was entered by hand, so the cut and fill is an estimate, not a measurement.'

/** Short enough for a panel heading. */
export function coverageHeadline(report: CoverageReport): string {
  if (report.totalSamples === 0) return 'Nothing to measure'
  if (report.complete) return 'Walked in full'
  return `${Math.round(report.fraction * 100)}% walked`
}

/**
 * The sentence under the number, or null when the number is fully measured.
 *
 * Null rather than a reassuring "100% covered" line: a caveat that appears when
 * everything is fine is a caveat people stop reading, and this one has to still
 * be read on the day it matters.
 */
export function coverageCaveat(report: CoverageReport, what: string): string | null {
  if (report.totalSamples === 0) return null
  if (report.complete) return null

  const missing = Math.round((1 - report.fraction) * 100)
  const gap =
    report.largestGapSqft >= 4 && report.largestGapSqft < report.gapAreaSqft * 0.95
      ? `, the largest hole ${formatSqft(report.largestGapSqft)}`
      : ''

  return (
    `${missing}% of ${what} was never walked (${formatSqft(report.gapAreaSqft)}${gap}). ` +
    'The ground there is interpolated from what surrounds it, not measured, so the earthwork over it is an estimate.'
  )
}

function formatSqft(value: number): string {
  return `${Math.round(value).toLocaleString()} sq ft`
}
