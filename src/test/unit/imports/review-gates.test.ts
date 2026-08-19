import { describe, it, expect } from 'vitest'
import {
  describeApplyDiff,
  hasApplicableContent,
  itemsBlockedByScale,
  summarizeApplyDiff,
} from '@/components/imports/apply-diff'
import { evaluateApplyGates, unreviewedFieldPaths } from '@/components/imports/gates'
import { labelForPath } from '@/components/imports/intent-fields'
import {
  parseRealDistanceInches,
  pixelsPerInchFrom,
  calibrationPxDistance,
  gridOverlay,
  poolDimensionLines,
  dimensionDisagrees,
} from '@/components/imports/overlay-geometry'
import { unreviewedFieldPaths as serverUnreviewedFieldPaths } from '@/modules/commands/categories/import'
import { emptyDesignIntent } from '@/modules/imports/intent'
import { reviewableIntent } from './intent-fixture'

describe('unreviewed field paths', () => {
  it('agrees with the server-side gate, which is the one that actually refuses', () => {
    const intent = reviewableIntent()
    const cases: string[][] = [[], ['deck.material'], ['deck.material', 'pool.depthDeepFt']]
    for (const touched of cases) {
      expect(unreviewedFieldPaths(intent, touched)).toEqual(
        serverUnreviewedFieldPaths(intent, touched),
      )
    }
  })

  it('lists only the paths below the review threshold that nobody has touched', () => {
    const intent = reviewableIntent()
    expect(unreviewedFieldPaths(intent, [])).toEqual(['deck.material', 'pool.depthDeepFt'])
    expect(unreviewedFieldPaths(intent, ['deck.material'])).toEqual(['pool.depthDeepFt'])
    expect(unreviewedFieldPaths(intent, ['deck.material', 'pool.depthDeepFt'])).toEqual([])
  })

  it('ignores medium and high confidence fields entirely', () => {
    const intent = reviewableIntent()
    expect(unreviewedFieldPaths(intent, [])).not.toContain('pool.widthFt')
    expect(unreviewedFieldPaths(intent, [])).not.toContain('pool.lengthFt')
  })
})

describe('apply gates', () => {
  it('blocks on a null scale and names it as the reason', () => {
    const intent = reviewableIntent({
      fieldConfidence: {},
      scale: { pixelsPerInch: null, method: null, confidence: 0 },
    })
    const gate = evaluateApplyGates({
      intent,
      touched: [],
      hasContent: true,
      alreadyApplied: false,
    })
    expect(gate.canApply).toBe(false)
    expect(gate.scaleResolved).toBe(false)
    expect(gate.reasons).toContain('scale')
  })

  it('blocks on unreviewed fields and lists them', () => {
    const gate = evaluateApplyGates({
      intent: reviewableIntent(),
      touched: [],
      hasContent: true,
      alreadyApplied: false,
    })
    expect(gate.canApply).toBe(false)
    expect(gate.reasons).toContain('review')
    expect(gate.unreviewed).toEqual(['deck.material', 'pool.depthDeepFt'])
  })

  it('allows an apply once both gates are satisfied', () => {
    const gate = evaluateApplyGates({
      intent: reviewableIntent(),
      touched: ['deck.material', 'pool.depthDeepFt'],
      hasContent: true,
      alreadyApplied: false,
    })
    expect(gate.canApply).toBe(true)
    expect(gate.reasons).toEqual([])
  })

  it('refuses to re-apply an already applied session', () => {
    const gate = evaluateApplyGates({
      intent: reviewableIntent({ fieldConfidence: {} }),
      touched: [],
      hasContent: true,
      alreadyApplied: true,
    })
    expect(gate.canApply).toBe(false)
    expect(gate.reasons).toContain('applied')
  })

  it('refuses an empty intent', () => {
    const gate = evaluateApplyGates({
      intent: emptyDesignIntent(),
      touched: [],
      hasContent: false,
      alreadyApplied: false,
    })
    expect(gate.reasons).toContain('empty')
  })
})

describe('apply diff summary', () => {
  it('states exactly what will be created', () => {
    const items = summarizeApplyDiff(reviewableIntent())
    expect(describeApplyDiff(items)).toBe(
      '1 polygon pool rectangle, 32 ft x 16 ft, 1 paver deck 6 ft wide, 1 spa 7 ft x 7 ft, 2 sun shelves 8 ft x 4 ft',
    )
  })

  it('collapses repeated features into one pluralised line', () => {
    const intent = reviewableIntent({
      features: [
        { stencilId: null, label: 'Sun shelf', lengthFt: 8, widthFt: 4, count: 1, x: 0, y: 0 },
        { stencilId: null, label: 'Sun shelf', lengthFt: 8, widthFt: 4, count: 1, x: 0, y: 0 },
      ],
    })
    const feature = summarizeApplyDiff(intent).find((item) => item.kind === 'feature')
    expect(feature?.count).toBe(2)
    expect(describeApplyDiff(summarizeApplyDiff(intent))).toContain('2 sun shelves')
  })

  it('names an enclosure only when one is actually present', () => {
    const without = summarizeApplyDiff(reviewableIntent())
    expect(without.some((item) => item.kind === 'enclosure')).toBe(false)

    const withEnclosure = summarizeApplyDiff(
      reviewableIntent({
        enclosure: { present: true, kind: 'screen', heightFt: 14, footprint: null },
      }),
    )
    expect(describeApplyDiff(withEnclosure)).toContain('1 screen enclosure 14 ft tall')
  })

  it('marks geometry as blocked while there is no scale', () => {
    const intent = reviewableIntent({
      scale: { pixelsPerInch: null, method: null, confidence: 0 },
    })
    const items = summarizeApplyDiff(intent)
    const blocked = itemsBlockedByScale(intent, items)
    expect(blocked.map((item) => item.key)).toEqual(['pool', 'deck'])
    expect(itemsBlockedByScale(reviewableIntent(), items)).toEqual([])
  })

  it('reports an empty intent as having nothing to create', () => {
    expect(summarizeApplyDiff(emptyDesignIntent())).toEqual([])
    expect(describeApplyDiff([])).toBe('Nothing to create yet')
    expect(hasApplicableContent(emptyDesignIntent())).toBe(false)
    expect(hasApplicableContent(reviewableIntent())).toBe(true)
  })
})

describe('path labelling', () => {
  it('uses the field table label when there is one', () => {
    expect(labelForPath('pool.lengthFt')).toBe('Pool length')
    expect(labelForPath('deck.material')).toBe('Deck material')
  })

  it('never leaves a raw dotted key in user-facing copy', () => {
    expect(labelForPath('features.0.count')).toBe('Features count 1')
    expect(labelForPath('site.setbacksFt')).toBe('Site setbacks')
  })
})

describe('calibration maths', () => {
  it('turns a marked span and a real distance into pixels per inch', () => {
    const px = calibrationPxDistance({ x: 100, y: 100 }, { x: 340, y: 100 })
    expect(px).toBe(240)
    expect(pixelsPerInchFrom(px, 120)).toBe(2)
  })

  it('refuses degenerate input rather than inventing a scale', () => {
    expect(pixelsPerInchFrom(0, 120)).toBeNull()
    expect(pixelsPerInchFrom(240, 0)).toBeNull()
    expect(pixelsPerInchFrom(Number.NaN, 120)).toBeNull()
  })

  it('reads a distance the way a builder types one', () => {
    expect(parseRealDistanceInches('20')).toBe(240)
    expect(parseRealDistanceInches('20 ft')).toBe(240)
    expect(parseRealDistanceInches("20' 6")).toBe(246)
    expect(parseRealDistanceInches('18 in')).toBe(18)
    expect(parseRealDistanceInches('')).toBeNull()
    expect(parseRealDistanceInches('abc')).toBeNull()
    expect(parseRealDistanceInches('-4')).toBeNull()
  })
})

describe('overlay geometry', () => {
  it('draws a one-foot grid from the resolved scale', () => {
    const grid = gridOverlay(1000, 500, 4)
    expect(grid?.spacingPx).toBe(48)
    expect(grid?.vertical[0]).toBe(48)
    expect(grid?.tooDense).toBe(false)
  })

  it('draws no grid at all without a scale', () => {
    expect(gridOverlay(1000, 500, null)).toBeNull()
  })

  it('flags a pitch too fine to be evidence rather than drawing a grey wash', () => {
    const grid = gridOverlay(1000, 500, 0.2)
    expect(grid?.tooDense).toBe(true)
    expect(grid?.vertical).toEqual([])
  })

  it('draws one dimension line per pool axis, carrying the read value', () => {
    const lines = poolDimensionLines(reviewableIntent(), 4)
    expect(lines.map((line) => line.path)).toEqual(['pool.lengthFt', 'pool.widthFt'])
    expect(lines[0]?.label).toBe('32 ft')
    expect(lines[0]?.measuredFt).toBe(32)
    expect(lines.every((line) => !dimensionDisagrees(line))).toBe(true)
  })

  it('flags a read value that disagrees with the span it was drawn from', () => {
    const lines = poolDimensionLines(reviewableIntent({
      pool: {
        footprint: reviewableIntent().pool.footprint,
        shapeFamily: 'rectangle',
        lengthFt: 40,
        widthFt: 16,
        depthShallowFt: 3,
        depthDeepFt: 6,
      },
    }), 4)
    expect(lines[0] && dimensionDisagrees(lines[0])).toBe(true)
  })

  it('draws nothing without a scale, because nothing can be registered', () => {
    expect(poolDimensionLines(reviewableIntent(), null)).toEqual([])
  })
})
