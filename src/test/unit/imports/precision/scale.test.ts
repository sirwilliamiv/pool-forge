import { describe, it, expect } from 'vitest'
import { CONFIDENCE_REVIEW_REQUIRED } from '@/modules/imports/intent'
import {
  AGREEMENT_TOLERANCE,
  fromGrid,
  fromLabeledDimensions,
  fromManual,
  fromScaleBar,
  pickScaleCandidate,
  resolveScale,
  type LabeledDimension,
} from '@/modules/imports/precision/scale'

/** A horizontal segment `px` long labelled as `realInches`. */
function dim(px: number, realInches: number): LabeledDimension {
  return { p1: { x: 0, y: 0 }, p2: { x: px, y: 0 }, realInches }
}

describe('fromGrid', () => {
  it('turns a pitch and a square size into pixels per inch', () => {
    const candidate = fromGrid(24, 12)
    expect(candidate?.pixelsPerInch).toBeCloseTo(2, 10)
    expect(candidate?.method).toBe('grid')
  })

  it('carries the detector confidence through', () => {
    expect(fromGrid(24, 12, 1)?.confidence).toBeGreaterThan(
      fromGrid(24, 12, 0.5)!.confidence,
    )
    expect(fromGrid(24, 12, 0.5)?.confidence).toBeCloseTo(0.49, 10)
  })

  it('refuses nonsense rather than dividing by it', () => {
    expect(fromGrid(0, 12)).toBeNull()
    expect(fromGrid(24, 0)).toBeNull()
    expect(fromGrid(-24, 12)).toBeNull()
    expect(fromGrid(Number.NaN, 12)).toBeNull()
  })
})

describe('fromLabeledDimensions', () => {
  it('returns null when there is nothing to work with', () => {
    expect(fromLabeledDimensions([])).toBeNull()
  })

  it('takes a lone dimension but says it could not be checked', () => {
    const candidate = fromLabeledDimensions([dim(240, 240)])
    expect(candidate?.pixelsPerInch).toBeCloseTo(1, 10)
    expect(candidate?.confidence).toBe(0.7)
    expect(candidate?.warnings.join(' ')).toContain('nothing to cross-check')
  })

  it('is confident when two dimensions agree', () => {
    // 12.0 and 12.24 px/in, 2% apart.
    const candidate = fromLabeledDimensions([dim(3600, 300), dim(1836, 150)])
    expect(candidate?.confidence).toBeGreaterThan(0.9)
    expect(candidate?.pixelsPerInch).toBeCloseTo(12.12, 6)
    expect(candidate?.warnings).toEqual([])
  })

  it('treats exactly the tolerance as agreement', () => {
    const base = 10
    const edge = base * (1 + AGREEMENT_TOLERANCE)
    const candidate = fromLabeledDimensions([dim(base * 100, 100), dim(edge * 100, 100)])
    expect(candidate?.confidence).toBeGreaterThan(0.9)
  })

  it('discards a lone outlier of three instead of letting it poison the result', () => {
    const candidate = fromLabeledDimensions([
      dim(1200, 100), // 12.0 px/in
      dim(1212, 100), // 12.12 px/in
      dim(1800, 100), // 18.0 px/in, the misread
    ])
    expect(candidate?.pixelsPerInch).toBeCloseTo(12.06, 6)
    expect(candidate?.confidence).toBe(0.8)
    expect(candidate?.warnings).toHaveLength(1)
    expect(candidate?.warnings[0]).toContain('labeled dimension 3')
    expect(candidate?.warnings[0]).toContain('dropped')
  })

  it('names the disagreeing pair and drops below the review gate on a two-way split', () => {
    const candidate = fromLabeledDimensions([
      dim(1200, 100), // 12.0 px/in
      dim(1560, 100), // 15.6 px/in, 30% apart
    ])
    expect(candidate).not.toBeNull()
    expect(candidate!.confidence).toBeLessThan(CONFIDENCE_REVIEW_REQUIRED)
    const warning = candidate!.warnings.join(' ')
    expect(warning).toContain('labeled dimensions 1 and 2')
    expect(warning).toContain('30.0%')
    expect(warning).toContain('manual calibration')
  })

  it('does not claim agreement when two pairs each disagree', () => {
    const candidate = fromLabeledDimensions([
      dim(1000, 100),
      dim(1400, 100),
      dim(1800, 100),
      dim(2200, 100),
    ])
    expect(candidate!.confidence).toBeLessThan(CONFIDENCE_REVIEW_REQUIRED)
  })

  it('ignores a degenerate dimension and still uses the rest', () => {
    const candidate = fromLabeledDimensions([
      { p1: { x: 5, y: 5 }, p2: { x: 5, y: 5 }, realInches: 100 },
      dim(1200, 100),
      dim(1210, 100),
    ])
    expect(candidate?.pixelsPerInch).toBeCloseTo(12.05, 6)
    expect(candidate?.warnings.join(' ')).toContain('labeled dimension 1 is degenerate')
  })

  it('measures diagonal dimension lines, not just axis-aligned ones', () => {
    const candidate = fromLabeledDimensions([
      { p1: { x: 0, y: 0 }, p2: { x: 300, y: 400 }, realInches: 50 },
    ])
    expect(candidate?.pixelsPerInch).toBeCloseTo(10, 10)
  })

  it('returns null when every dimension is unusable', () => {
    expect(
      fromLabeledDimensions([
        { p1: { x: 1, y: 1 }, p2: { x: 1, y: 1 }, realInches: 10 },
        dim(100, 0),
      ]),
    ).toBeNull()
  })
})

describe('fromScaleBar and fromManual', () => {
  it('divide pixels by inches', () => {
    expect(fromScaleBar({ x: 0, y: 0 }, { x: 120, y: 0 }, 240)?.pixelsPerInch).toBeCloseTo(0.5, 10)
    expect(fromManual(360, 120)?.pixelsPerInch).toBeCloseTo(3, 10)
  })

  it('refuse degenerate input', () => {
    expect(fromScaleBar({ x: 4, y: 4 }, { x: 4, y: 4 }, 10)).toBeNull()
    expect(fromManual(100, 0)).toBeNull()
    expect(fromManual(-1, 10)).toBeNull()
  })
})

describe('resolveScale', () => {
  it('returns unresolved for no candidates, and invents nothing', () => {
    expect(resolveScale([])).toEqual({ pixelsPerInch: null, method: null, confidence: 0 })
    expect(resolveScale([null, null])).toEqual({
      pixelsPerInch: null,
      method: null,
      confidence: 0,
    })
  })

  it('follows the spec trust order: grid beats labeled beats scale bar beats manual', () => {
    const grid = fromGrid(24, 12)
    const labeled = fromLabeledDimensions([dim(1200, 100), dim(1210, 100)])
    const bar = fromScaleBar({ x: 0, y: 0 }, { x: 500, y: 0 }, 100)
    const manual = fromManual(700, 100)

    expect(resolveScale([manual, bar, labeled, grid]).method).toBe('grid')
    expect(resolveScale([manual, bar, labeled]).method).toBe('labeled-dimension')
    expect(resolveScale([manual, bar]).method).toBe('scale-bar')
    expect(resolveScale([manual]).method).toBe('manual')
  })

  it('prefers a trustworthy lower-ranked source over an untrusted higher-ranked one', () => {
    // Labeled dimensions outrank a scale bar, but not when they contradict
    // each other badly enough to fall below the review threshold.
    const contradicting = fromLabeledDimensions([dim(1200, 100), dim(1560, 100)])
    const bar = fromScaleBar({ x: 0, y: 0 }, { x: 500, y: 0 }, 100)
    expect(resolveScale([contradicting, bar]).method).toBe('scale-bar')
  })

  it('still surfaces an untrusted value when it is all there is', () => {
    const contradicting = fromLabeledDimensions([dim(1200, 100), dim(1560, 100)])
    const scale = resolveScale([contradicting])
    expect(scale.pixelsPerInch).not.toBeNull()
    expect(scale.confidence).toBeLessThan(CONFIDENCE_REVIEW_REQUIRED)
  })

  it('picks the most confident candidate within one method', () => {
    const weak = fromGrid(24, 12, 0.4)
    const strong = fromGrid(48, 12, 0.95)
    expect(pickScaleCandidate([weak, strong])?.pixelsPerInch).toBeCloseTo(4, 10)
  })

  it('drops candidates whose value is not usable', () => {
    const broken = { pixelsPerInch: 0, method: 'grid' as const, confidence: 1, warnings: [] }
    const good = fromManual(120, 12)
    expect(resolveScale([broken, good]).method).toBe('manual')
  })

  it('never averages across methods', () => {
    const grid = fromGrid(24, 12) // 2 px/in
    const manual = fromManual(1200, 100) // 12 px/in
    expect(resolveScale([grid, manual]).pixelsPerInch).toBeCloseTo(2, 10)
  })
})
