// Resolving pixels-per-inch. This is the gate on the whole ingestion feature:
// with no scale there is no dimension, and with a wrong scale every dimension
// is wrong by the same factor, silently and plausibly.
//
// So the rules here are conservative on purpose. Nothing is averaged across
// methods, nothing is extrapolated, and `resolveScale` never returns a number
// that some candidate did not actually produce. Unresolved is `pixelsPerInch:
// null`, which `import.intent.apply` treats as a hard block.

import { CONFIDENCE_REVIEW_REQUIRED, type Point, type Scale, type ScaleMethod } from '../intent'

/** Labeled dimensions within this relative gap of each other corroborate. */
export const AGREEMENT_TOLERANCE = 0.05

export interface ScaleCandidate {
  pixelsPerInch: number
  method: ScaleMethod
  confidence: number
  warnings: string[]
}

export interface LabeledDimension {
  p1: Point
  p2: Point
  realInches: number
}

/** Trust order from the design spec. Earlier is more trustworthy. */
export const SCALE_TRUST_ORDER: readonly ScaleMethod[] = [
  'grid',
  'labeled-dimension',
  'scale-bar',
  'manual',
]

const UNRESOLVED: Scale = { pixelsPerInch: null, method: null, confidence: 0 }

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function usable(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function round2(value: number): string {
  return value.toFixed(2)
}

/**
 * Grid pitch is the most trustworthy source: it is measured by code from the
 * pixels rather than read by a model from handwriting. `squareRealInches` is
 * what the sketch says one square is worth, typically 12 for "1 sq = 1 ft".
 */
export function fromGrid(
  pitchPx: number,
  squareRealInches: number,
  gridConfidence = 1,
): ScaleCandidate | null {
  if (!usable(pitchPx) || !usable(squareRealInches)) return null
  const confidence = Math.min(0.98, Math.max(0, gridConfidence) * 0.98)
  return {
    pixelsPerInch: pitchPx / squareRealInches,
    method: 'grid',
    confidence,
    warnings: [],
  }
}

/**
 * Cross-checks every labeled dimension against the others.
 *
 * One dimension is taken on trust but flagged, since a misread "32" for "34"
 * is invisible without a second opinion. Two or more get compared: agreement
 * within 5% is strong evidence, a lone outlier among three or more is dropped,
 * and a straight two-way disagreement is reported at a confidence below the
 * review threshold so the user is pushed into manual calibration.
 */
export function fromLabeledDimensions(
  dims: readonly LabeledDimension[],
): ScaleCandidate | null {
  const measured: { index: number; ppi: number }[] = []
  const warnings: string[] = []

  dims.forEach((dim, index) => {
    const px = distance(dim.p1, dim.p2)
    if (!usable(px) || !usable(dim.realInches)) {
      warnings.push(`labeled dimension ${index + 1} is degenerate and was ignored`)
      return
    }
    measured.push({ index, ppi: px / dim.realInches })
  })

  if (measured.length === 0) return null

  if (measured.length === 1) {
    const only = measured[0]!
    warnings.push(
      'only one labeled dimension was read, so there is nothing to cross-check it against',
    )
    return {
      pixelsPerInch: only.ppi,
      method: 'labeled-dimension',
      confidence: 0.7,
      warnings,
    }
  }

  const overallMedian = median(measured.map((m) => m.ppi))
  const inliers = measured.filter(
    (m) => Math.abs(m.ppi - overallMedian) / overallMedian <= AGREEMENT_TOLERANCE,
  )
  const outliers = measured.filter((m) => !inliers.includes(m))

  if (outliers.length === 0) {
    return {
      pixelsPerInch: overallMedian,
      method: 'labeled-dimension',
      confidence: 0.92,
      warnings,
    }
  }

  // A clear majority means the odd one out is a misread, not a scale problem.
  if (inliers.length >= 2 && inliers.length > outliers.length) {
    const agreed = median(inliers.map((m) => m.ppi))
    for (const outlier of outliers) {
      const gap = Math.abs(outlier.ppi - agreed) / agreed
      warnings.push(
        `labeled dimension ${outlier.index + 1} disagrees with the rest ` +
          `(${round2(outlier.ppi)} px/in against ${round2(agreed)} px/in, ` +
          `${(gap * 100).toFixed(1)}% apart); dropped from the scale estimate`,
      )
    }
    return {
      pixelsPerInch: agreed,
      method: 'labeled-dimension',
      confidence: 0.8,
      warnings,
    }
  }

  // No majority: name the widest disagreeing pair and drop below the review
  // threshold, which forces the calibration tool rather than a wrong pool.
  const worst = widestPair(measured)
  if (worst) {
    const gap = Math.abs(worst.a.ppi - worst.b.ppi) / Math.min(worst.a.ppi, worst.b.ppi)
    warnings.push(
      `labeled dimensions ${worst.a.index + 1} and ${worst.b.index + 1} disagree ` +
        `(${round2(worst.a.ppi)} px/in against ${round2(worst.b.ppi)} px/in, ` +
        `${(gap * 100).toFixed(1)}% apart); scale needs manual calibration`,
    )
  }
  return {
    pixelsPerInch: overallMedian,
    method: 'labeled-dimension',
    confidence: 0.3,
    warnings,
  }
}

function widestPair(
  measured: readonly { index: number; ppi: number }[],
): { a: { index: number; ppi: number }; b: { index: number; ppi: number } } | null {
  let best: { a: { index: number; ppi: number }; b: { index: number; ppi: number } } | null = null
  let worstGap = -1
  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i]!
      const b = measured[j]!
      const gap = Math.abs(a.ppi - b.ppi) / Math.min(a.ppi, b.ppi)
      if (gap > worstGap) {
        worstGap = gap
        best = { a, b }
      }
    }
  }
  return best
}

/** A plat's scale bar: a drawn segment annotated with what it represents. */
export function fromScaleBar(p1: Point, p2: Point, realInches: number): ScaleCandidate | null {
  const px = distance(p1, p2)
  if (!usable(px) || !usable(realInches)) return null
  return {
    pixelsPerInch: px / realInches,
    method: 'scale-bar',
    confidence: 0.8,
    warnings: [],
  }
}

/**
 * The human fallback: two points clicked on the image plus the real distance
 * between them. `surveyStore.ts` already persists these as
 * `calibrationPxDistance` / `calibrationRealInches`.
 */
export function fromManual(pxDistance: number, realInches: number): ScaleCandidate | null {
  if (!usable(pxDistance) || !usable(realInches)) return null
  return {
    pixelsPerInch: pxDistance / realInches,
    method: 'manual',
    confidence: 0.95,
    warnings: [],
  }
}

/**
 * Picks the winning candidate by the spec's trust order, preferring any
 * candidate that clears the review threshold before falling back to one that
 * does not. A low-confidence winner is still returned: the value seeds the
 * calibration UI, and the confidence carried alongside it is what stops the
 * apply command from writing it unreviewed.
 */
export function pickScaleCandidate(
  candidates: readonly (ScaleCandidate | null)[],
): ScaleCandidate | null {
  const valid = candidates.filter(
    (c): c is ScaleCandidate => c !== null && usable(c.pixelsPerInch),
  )
  if (valid.length === 0) return null

  const byTrust = (pool: readonly ScaleCandidate[]): ScaleCandidate | null => {
    for (const method of SCALE_TRUST_ORDER) {
      const matches = pool.filter((c) => c.method === method)
      if (matches.length === 0) continue
      return matches.reduce((best, c) => (c.confidence > best.confidence ? c : best))
    }
    return null
  }

  const trusted = valid.filter((c) => c.confidence >= CONFIDENCE_REVIEW_REQUIRED)
  return byTrust(trusted) ?? byTrust(valid)
}

/**
 * The `Scale` an extractor writes into `DesignIntent`. Empty or unusable input
 * yields `pixelsPerInch: null`: no method invents a value from nothing.
 */
export function resolveScale(candidates: readonly (ScaleCandidate | null)[]): Scale {
  const winner = pickScaleCandidate(candidates)
  if (!winner) return { ...UNRESOLVED }
  return {
    pixelsPerInch: winner.pixelsPerInch,
    method: winner.method,
    confidence: winner.confidence,
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Which scale wins when an image is re-analysed.
 *
 * A hand calibration outranks everything: the user stood in front of the image
 * and told us a real distance, and no automatic pass gets to overrule that. A
 * fresh automatic resolution beats a stale one. Failing both, whatever the
 * session already had is preserved rather than blanked.
 *
 * The bug this exists to prevent: re-analysis overwrote scale unconditionally,
 * so calibrating and then pressing Re-analyze silently discarded the two points
 * and told the user again that the image has no scale, while the calibration
 * record still sat in the analysis log.
 */
export function preferredScale(existing: Scale, computed: Scale): Scale {
  if (existing.method === 'manual' && existing.pixelsPerInch !== null) return existing
  if (computed.pixelsPerInch !== null) return computed
  return existing
}
