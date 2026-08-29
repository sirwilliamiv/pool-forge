// Graph-paper grid detection. Pure functions over raw grayscale pixels: no
// network, no model, no DOM. The caller decodes the image and hands us bytes.
//
// The method is the one named in the design spec: row and column intensity
// projections, then autocorrelation to find the dominant period.
//
// Four things make a real photograph hostile to that method, and each has a
// deliberate countermeasure here:
//
//   1. Uneven lighting. A gradient across the frame dwarfs the faint rules.
//      Countered by subtracting a local box mean before anything else, so the
//      signal is "ink relative to the paper right here", not absolute darkness.
//   2. The drawing is darker than the grid. A few thick pen strokes would
//      otherwise dominate the projection. Countered by clipping per-pixel ink
//      at a high percentile: grid lines survive, heavy strokes are flattened.
//   3. Slight rotation. Over a full-height projection, 3 degrees smears a
//      vertical rule across 5% of the height, which erases the period. Countered
//      by projecting narrow bands (about 32px, so drift stays under ~1.7px) and
//      averaging the per-band autocorrelations. Autocorrelation is phase
//      invariant, so bands with different phases still reinforce the period.
//   4. Partial coverage. A grid over half the frame still autocorrelates, just
//      with a lower peak, which is what the confidence score reports.
//
// Refusal is a feature. A wrong pitch silently multiplies into every number on
// a customer quote, so a peak that is not clearly dominant returns null.

import type { Point } from '../intent'

export interface GridDetection {
  /** Grid pitch in pixels, sub-pixel refined. */
  pitchPx: number
  /** 0..1. Above ~0.6 the pitch is trustworthy enough to drive scale. */
  confidence: number
  /**
   * Offset of the first grid line from the image origin, in pixels, each axis
   * in [0, pitchPx). Grid lines sit at `originOffsetPx.x + k * pitchPx`.
   */
  originOffsetPx: Point
}

export interface GridDetectionOptions {
  /** Smallest pitch to consider. Below ~4px a grid is not resolvable anyway. */
  minPitchPx: number
  maxPitchPx: number
  /** Minimum periodicity score for a detection to be returned at all. */
  minConfidence: number
  /** Box-mean radius. 0 derives one from the image size. */
  localMeanRadiusPx: number
  /** Per-pixel ink is clipped at this percentile so strokes cannot swamp rules. */
  inkClipPercentile: number
  /** Band height/width, in pixels, for the rotation-tolerant projections. */
  bandSizePx: number
  /** Cap on how many bands per axis get autocorrelated. */
  maxBands: number
  /** Max relative gap between the x and y pitch before the detection is refused. */
  axisAgreementTolerance: number
  /** The winning period must beat the best non-harmonic rival by this factor. */
  dominanceRatio: number
}

export const GRID_DEFAULTS: GridDetectionOptions = {
  minPitchPx: 4,
  maxPitchPx: 240,
  minConfidence: 0.3,
  localMeanRadiusPx: 0,
  inkClipPercentile: 0.92,
  bandSizePx: 32,
  maxBands: 24,
  axisAgreementTolerance: 0.08,
  dominanceRatio: 1.25,
}

/** One axis worth of periodicity evidence, before the two axes are combined. */
export interface AxisPeriod {
  periodPx: number
  score: number
  rivalScore: number
}

function resolveOptions(options: Partial<GridDetectionOptions>): GridDetectionOptions {
  return {
    minPitchPx: options.minPitchPx ?? GRID_DEFAULTS.minPitchPx,
    maxPitchPx: options.maxPitchPx ?? GRID_DEFAULTS.maxPitchPx,
    minConfidence: options.minConfidence ?? GRID_DEFAULTS.minConfidence,
    localMeanRadiusPx: options.localMeanRadiusPx ?? GRID_DEFAULTS.localMeanRadiusPx,
    inkClipPercentile: options.inkClipPercentile ?? GRID_DEFAULTS.inkClipPercentile,
    bandSizePx: options.bandSizePx ?? GRID_DEFAULTS.bandSizePx,
    maxBands: options.maxBands ?? GRID_DEFAULTS.maxBands,
    axisAgreementTolerance:
      options.axisAgreementTolerance ?? GRID_DEFAULTS.axisAgreementTolerance,
    dominanceRatio: options.dominanceRatio ?? GRID_DEFAULTS.dominanceRatio,
  }
}

/**
 * Ink field: how much darker each pixel is than the paper immediately around
 * it, clipped so that thick strokes do not outweigh many faint rules.
 *
 * Exported because it is worth testing on its own: a lighting gradient must
 * come out flat here, or nothing downstream can recover.
 */
export function inkField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  clipPercentile: number,
): Float32Array {
  const n = width * height
  const ink = new Float32Array(n)
  if (n === 0) return ink

  // Integral image over the raw values, so the box mean is O(1) per pixel.
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x]!
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)]! + rowSum
    }
  }

  const r = Math.max(1, Math.round(radius))
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const area = (y1 - y0 + 1) * (x1 - x0 + 1)
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)]! -
        integral[y0 * (width + 1) + (x1 + 1)]! -
        integral[(y1 + 1) * (width + 1) + x0]! +
        integral[y0 * (width + 1) + x0]!
      const mean = sum / area
      const value = data[y * width + x]!
      ink[y * width + x] = Math.max(0, mean - value)
    }
  }

  clipAtPercentile(ink, clipPercentile)
  return ink
}

/** Flattens everything above the given percentile down to it, in place. */
function clipAtPercentile(ink: Float32Array, percentile: number): void {
  let max = 0
  for (let i = 0; i < ink.length; i++) {
    const v = ink[i]!
    if (v > max) max = v
  }
  if (max <= 0) return

  const BINS = 256
  const histogram = new Int32Array(BINS)
  for (let i = 0; i < ink.length; i++) {
    const bin = Math.min(BINS - 1, Math.floor((ink[i]! / max) * BINS))
    histogram[bin]!++
  }
  const target = Math.max(1, Math.floor(ink.length * Math.min(0.999, Math.max(0, percentile))))
  let cumulative = 0
  let cutoffBin = BINS - 1
  for (let b = 0; b < BINS; b++) {
    cumulative += histogram[b]!
    if (cumulative >= target) {
      cutoffBin = b
      break
    }
  }
  const cutoff = ((cutoffBin + 1) / BINS) * max
  if (cutoff <= 0) return
  for (let i = 0; i < ink.length; i++) {
    if (ink[i]! > cutoff) ink[i] = cutoff
  }
}

/** Sum of ink down each column, over rows [y0, y1). Length = width. */
export function columnProjection(
  ink: Float32Array,
  width: number,
  y0: number,
  y1: number,
): Float64Array {
  const out = new Float64Array(width)
  for (let y = y0; y < y1; y++) {
    const rowStart = y * width
    for (let x = 0; x < width; x++) out[x]! += ink[rowStart + x]!
  }
  return out
}

/** Sum of ink across each row, over columns [x0, x1). Length = height. */
export function rowProjection(
  ink: Float32Array,
  width: number,
  height: number,
  x0: number,
  x1: number,
): Float64Array {
  const out = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * width
    let sum = 0
    for (let x = x0; x < x1; x++) sum += ink[rowStart + x]!
    out[y] = sum
  }
  return out
}

/**
 * Normalized autocorrelation, r[0] = 1. Uses the 1/(N - lag) scaling so peak
 * heights stay comparable across lags rather than decaying linearly, which
 * would bias every search toward the smallest period.
 */
export function autocorrelation(signal: Float64Array, maxLag: number): Float64Array {
  const n = signal.length
  const lagCap = Math.max(0, Math.min(maxLag, Math.floor(n / 3)))
  const out = new Float64Array(lagCap + 1)
  if (n < 2) return out

  let mean = 0
  for (let i = 0; i < n; i++) mean += signal[i]!
  mean /= n

  let variance = 0
  for (let i = 0; i < n; i++) {
    const d = signal[i]! - mean
    variance += d * d
  }
  variance /= n
  if (variance <= 1e-12) return out

  out[0] = 1
  for (let lag = 1; lag <= lagCap; lag++) {
    let sum = 0
    for (let i = 0; i + lag < n; i++) {
      sum += (signal[i]! - mean) * (signal[i + lag]! - mean)
    }
    out[lag] = sum / (n - lag) / variance
  }
  return out
}

function sampleMax(r: Float64Array, center: number, tolerance: number): number {
  const lo = Math.max(1, Math.round(center - tolerance))
  const hi = Math.min(r.length - 1, Math.round(center + tolerance))
  if (lo > hi) return -1
  let best = -Infinity
  for (let i = lo; i <= hi; i++) {
    const v = r[i]!
    if (v > best) best = v
  }
  return best
}

/**
 * Value at a fractional lag, linearly interpolated. Troughs are sampled at a
 * point rather than minimised over a window: a window wider than half the true
 * period always finds a trough somewhere inside it, which would let every
 * multiple of the real pitch score as well as the pitch itself.
 */
function sampleAt(r: Float64Array, lag: number): number {
  if (lag < 1) return 0
  const lo = Math.floor(lag)
  const hi = lo + 1
  const a = r[lo]
  if (a === undefined) return 0
  const b = r[hi]
  if (b === undefined) return a
  const t = lag - lo
  return a * (1 - t) + b * t
}

/**
 * Score a candidate fundamental period by how well the autocorrelation looks
 * like a comb: peaks at every multiple, troughs halfway between.
 *
 * This alone cannot separate a pitch from its multiples (at 3x the pitch the
 * half-multiples still land on troughs), which is why `dominantPeriod` breaks
 * the tie by taking the smallest period that scores near the best.
 */
export function combScore(r: Float64Array, period: number): number {
  const maxLag = r.length - 1
  if (period < 2 || period > maxLag) return -Infinity
  const harmonics = Math.min(4, Math.floor(maxLag / period))
  if (harmonics < 1) return -Infinity

  let peakSum = 0
  let troughSum = 0
  for (let k = 1; k <= harmonics; k++) {
    // The fundamental is sampled exactly: candidates are peaks already, and a
    // window there would let a lag next to the real one borrow its score.
    // Higher harmonics get a window, since a fractional pitch drifts by k times
    // the rounding error by the time it reaches the k-th multiple.
    peakSum +=
      k === 1 ? sampleAt(r, period) : sampleMax(r, k * period, Math.max(1, k * period * 0.05))
    troughSum += sampleAt(r, (k - 0.5) * period)
  }
  return peakSum / harmonics - troughSum / harmonics
}

/** Parabolic interpolation around an integer peak, for sub-pixel pitch. */
function refinePeak(r: Float64Array, lag: number): number {
  const prev = r[lag - 1]
  const here = r[lag]
  const next = r[lag + 1]
  if (prev === undefined || here === undefined || next === undefined) return lag
  const denom = prev - 2 * here + next
  if (Math.abs(denom) < 1e-12) return lag
  const delta = (0.5 * (prev - next)) / denom
  if (!Number.isFinite(delta) || Math.abs(delta) > 1) return lag
  return lag + delta
}

export function isHarmonicallyRelated(a: number, b: number): boolean {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  if (lo <= 0) return false
  const ratio = hi / lo
  if (ratio > 12) return false
  return Math.abs(ratio - Math.round(ratio)) <= 0.08
}

/** A period scoring within this fraction of the best is treated as tied with it. */
const FUNDAMENTAL_TIE = 0.85

/**
 * Best period in the search window, plus the best rival that is not one of its
 * harmonics. Callers use the gap between the two to decide whether to trust it.
 *
 * Among periods that score alike, the smallest wins. Every multiple of the true
 * pitch reproduces the comb, so without that rule a 20px grid is just as
 * happily reported as 60px, and every measured dimension comes out 3x too
 * small. The fundamental is the shortest period that explains the signal.
 */
export function dominantPeriod(
  r: Float64Array,
  options: GridDetectionOptions,
): AxisPeriod | null {
  const maxLag = r.length - 1
  const lo = Math.max(2, Math.round(options.minPitchPx))
  const hi = Math.min(maxLag - 1, Math.round(options.maxPitchPx))
  if (hi <= lo) return null

  const candidates: { lag: number; score: number }[] = []
  for (let lag = lo; lag <= hi; lag++) {
    const here = r[lag]!
    const prev = r[lag - 1]!
    const next = r[lag + 1]!
    if (here < prev || here < next) continue
    if (here <= 0) continue
    const score = combScore(r, lag)
    if (!Number.isFinite(score)) continue
    candidates.push({ lag, score })
  }
  if (candidates.length === 0) return null

  const topScore = candidates.reduce((best, c) => Math.max(best, c.score), -Infinity)
  if (!(topScore > 0)) return null
  const tied = candidates.filter((c) => c.score >= topScore * FUNDAMENTAL_TIE)
  const best = tied.reduce((smallest, c) => (c.lag < smallest.lag ? c : smallest))

  let rivalScore = 0
  for (const candidate of candidates) {
    if (isHarmonicallyRelated(candidate.lag, best.lag)) continue
    if (candidate.score > rivalScore) rivalScore = candidate.score
  }

  return { periodPx: refinePeak(r, best.lag), score: best.score, rivalScore }
}

function bandRanges(extent: number, bandSize: number, maxBands: number): [number, number][] {
  const size = Math.max(1, Math.min(extent, Math.round(bandSize)))
  const total = Math.max(1, Math.floor(extent / size))
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxBands)))
  const ranges: [number, number][] = []
  for (let b = 0; b < total; b += stride) {
    const start = b * size
    ranges.push([start, Math.min(extent, start + size)])
  }
  return ranges
}

function averageAutocorrelation(signals: Float64Array[], maxLag: number): Float64Array | null {
  let accumulator: Float64Array | null = null
  let count = 0
  for (const signal of signals) {
    const r = autocorrelation(signal, maxLag)
    if (r.length <= 1) continue
    if (r[0] === 0) continue
    if (accumulator === null) accumulator = new Float64Array(r.length)
    const len = Math.min(accumulator.length, r.length)
    for (let i = 0; i < len; i++) accumulator[i]! += r[i]!
    count++
  }
  if (accumulator === null || count === 0) return null
  for (let i = 0; i < accumulator.length; i++) accumulator[i]! /= count
  return accumulator
}

/**
 * Offset in [0, period) of the ink maxima, from the first DFT bin at that
 * period. Modelling the projection as `A cos(2 pi (i - o) / L)` gives
 * `o = L * atan2(S, C) / 2 pi` with C and S the cosine and sine sums.
 */
export function estimatePhase(signal: Float64Array, period: number): number {
  const n = signal.length
  if (n === 0 || period <= 0) return 0
  let mean = 0
  for (let i = 0; i < n; i++) mean += signal[i]!
  mean /= n

  let cosSum = 0
  let sinSum = 0
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / period
    const centered = signal[i]! - mean
    cosSum += centered * Math.cos(angle)
    sinSum += centered * Math.sin(angle)
  }
  const offset = (period * Math.atan2(sinSum, cosSum)) / (2 * Math.PI)
  return ((offset % period) + period) % period
}

/**
 * Detect the pitch of a regular grid in a grayscale image.
 *
 * `data` is one byte per pixel in row-major order (0 = black). Returns null
 * whenever the evidence is not clearly dominant: a wrong pitch propagates into
 * every measured dimension, so no answer is strictly better than a bad one.
 */
export function detectGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Partial<GridDetectionOptions> = {},
): GridDetection | null {
  const opts = resolveOptions(options)
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < 8 || height < 8) return null
  if (data.length < width * height) return null

  const radius =
    opts.localMeanRadiusPx > 0
      ? opts.localMeanRadiusPx
      : Math.max(4, Math.round(Math.min(width, height) / 24))
  const ink = inkField(data, width, height, radius, opts.inkClipPercentile)

  const maxLagX = Math.min(opts.maxPitchPx + 2, Math.floor(width / 3))
  const maxLagY = Math.min(opts.maxPitchPx + 2, Math.floor(height / 3))

  const columnBands = bandRanges(height, opts.bandSizePx, opts.maxBands).map(([y0, y1]) =>
    columnProjection(ink, width, y0, y1),
  )
  const rowBands = bandRanges(width, opts.bandSizePx, opts.maxBands).map(([x0, x1]) =>
    rowProjection(ink, width, height, x0, x1),
  )

  const rx = averageAutocorrelation(columnBands, maxLagX)
  const ry = averageAutocorrelation(rowBands, maxLagY)
  const px = rx ? dominantPeriod(rx, opts) : null
  const py = ry ? dominantPeriod(ry, opts) : null

  const pitch = combineAxes(px, py, opts)
  if (pitch === null) return null

  // Phase comes from the single central band, where slight rotation has had the
  // least room to smear the lines. Averaging bands would cancel the phase out.
  const centralColumns = centralBand(height, opts.bandSizePx)
  const centralRows = centralBand(width, opts.bandSizePx)
  const phaseX = estimatePhase(
    columnProjection(ink, width, centralColumns[0], centralColumns[1]),
    pitch.pitchPx,
  )
  const phaseY = estimatePhase(
    rowProjection(ink, width, height, centralRows[0], centralRows[1]),
    pitch.pitchPx,
  )

  return {
    pitchPx: pitch.pitchPx,
    confidence: pitch.confidence,
    originOffsetPx: { x: phaseX, y: phaseY },
  }
}

function centralBand(extent: number, bandSize: number): [number, number] {
  const size = Math.max(1, Math.min(extent, Math.round(bandSize)))
  const start = Math.max(0, Math.min(extent - size, Math.floor((extent - size) / 2)))
  return [start, start + size]
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function accept(axis: AxisPeriod, opts: GridDetectionOptions, scoreFloor: number): boolean {
  if (axis.score < scoreFloor) return false
  return axis.score >= opts.dominanceRatio * Math.max(axis.rivalScore, 0)
}

function combineAxes(
  px: AxisPeriod | null,
  py: AxisPeriod | null,
  opts: GridDetectionOptions,
): { pitchPx: number; confidence: number } | null {
  const xOk = px !== null && accept(px, opts, opts.minConfidence)
  const yOk = py !== null && accept(py, opts, opts.minConfidence)

  if (px !== null && py !== null && xOk && yOk) {
    // Graph paper is square. Two axes that disagree mean one of them locked
    // onto something that is not the grid, and there is no way to tell which.
    const gap = Math.abs(px.periodPx - py.periodPx) / Math.min(px.periodPx, py.periodPx)
    if (gap > opts.axisAgreementTolerance) return null
    const weightX = Math.max(px.score, 1e-6)
    const weightY = Math.max(py.score, 1e-6)
    const pitchPx = (px.periodPx * weightX + py.periodPx * weightY) / (weightX + weightY)
    const agreement = 1 - gap / opts.axisAgreementTolerance
    const confidence = clamp01(((px.score + py.score) / 2) * (0.85 + 0.15 * agreement))
    return { pitchPx, confidence: Math.min(0.99, confidence) }
  }

  // One axis only: plausible under partial coverage, but held to a stricter
  // floor and reported at reduced confidence because nothing corroborates it.
  const single = xOk && px !== null ? px : yOk && py !== null ? py : null
  if (single === null) return null
  if (!accept(single, opts, opts.minConfidence * 1.5)) return null
  return { pitchPx: single.periodPx, confidence: clamp01(single.score * 0.7) }
}
