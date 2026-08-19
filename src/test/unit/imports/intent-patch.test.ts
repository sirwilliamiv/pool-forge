import { describe, expect, it } from 'vitest'

import {
  DesignIntentSchema,
  emptyDesignIntent,
  pathCoveredBy,
  unreviewedFieldPaths,
  type DesignIntent,
} from '@/modules/imports/intent'
import {
  DesignIntentPatchSchema,
  applyIntentPatch,
  parseStoredIntent,
  touchedPaths,
} from '@/modules/imports/patch'

describe('applyIntentPatch', () => {
  it('merges a section without clearing its siblings', () => {
    const base = emptyDesignIntent(['img-1'])
    const next = applyIntentPatch(base, { pool: { lengthFt: 32 } })
    expect(next.pool.lengthFt).toBe(32)
    expect(next.pool.shapeFamily).toBe('unknown')
    expect(next.sourceImageIds).toEqual(['img-1'])
  })

  it('leaves the input untouched', () => {
    const base = emptyDesignIntent()
    applyIntentPatch(base, { pool: { widthFt: 16 } })
    expect(base.pool.widthFt).toBeNull()
  })

  it('replaces arrays rather than appending, so a removal is expressible', () => {
    const base = applyIntentPatch(emptyDesignIntent(), {
      features: [
        { stencilId: null, label: 'Spa', lengthFt: 7, widthFt: 7, count: 1, x: 0, y: 0 },
        { stencilId: null, label: 'Bench', lengthFt: 8, widthFt: 2, count: 1, x: 0, y: 0 },
      ],
    })
    expect(base.features).toHaveLength(2)
    const removed = applyIntentPatch(base, { features: [] })
    expect(removed.features).toHaveLength(0)
  })

  it('merges fieldConfidence rather than replacing the whole map', () => {
    const base = applyIntentPatch(emptyDesignIntent(), {
      fieldConfidence: { 'pool.lengthFt': 0.4, 'pool.widthFt': 0.9 },
    })
    const next = applyIntentPatch(base, { fieldConfidence: { 'pool.lengthFt': 1 } })
    expect(next.fieldConfidence).toEqual({ 'pool.lengthFt': 1, 'pool.widthFt': 0.9 })
  })

  it('an empty patch is the identity', () => {
    const base = emptyDesignIntent(['a'])
    expect(applyIntentPatch(base, {})).toEqual(base)
  })

  it('produces a document the contract schema still accepts', () => {
    const next = applyIntentPatch(emptyDesignIntent(), {
      pool: { shapeFamily: 'kidney', lengthFt: 30 },
      scale: { pixelsPerInch: 4, method: 'grid', confidence: 0.9 },
    })
    expect(DesignIntentSchema.safeParse(next).success).toBe(true)
  })

  it('never writes a null section over a required one', () => {
    const parsed = DesignIntentPatchSchema.safeParse({ pool: null })
    expect(parsed.success).toBe(false)
  })
})

describe('touchedPaths', () => {
  it('lists dotted paths for every field a human changed', () => {
    expect(touchedPaths({ pool: { lengthFt: 32, widthFt: 16 }, warnings: [] })).toEqual([
      'pool.lengthFt',
      'pool.widthFt',
      'warnings',
    ])
  })

  it('is empty for an empty patch', () => {
    expect(touchedPaths({})).toEqual([])
  })
})

describe('parseStoredIntent', () => {
  it('reads back a valid stored document', () => {
    const intent = emptyDesignIntent(['img-1'])
    expect(parseStoredIntent(JSON.parse(JSON.stringify(intent)))).toEqual(intent)
  })

  it('returns null for junk rather than throwing', () => {
    expect(parseStoredIntent({})).toBeNull()
    expect(parseStoredIntent(null)).toBeNull()
    expect(parseStoredIntent('nope')).toBeNull()
  })
})

// Gate 2 regression. `fieldConfidence` keys are not limited to two segments,
// so a shallow `touchedPaths` walk emitted `features` while the blocking key
// was `features.0.count`. Nothing matched, and the field stayed blocked no
// matter how many times a human corrected it: apply was unreachable forever.
describe('review gate over deep confidence paths', () => {
  function intentWithLowConfidence(paths: string[]): DesignIntent {
    const intent = emptyDesignIntent(['img-1'])
    for (const path of paths) intent.fieldConfidence[path] = 0.2
    return intent
  }

  it('clears a deep path when the human replaces its whole array', () => {
    const intent = intentWithLowConfidence(['features.0.count'])
    expect(unreviewedFieldPaths(intent, [])).toEqual(['features.0.count'])

    const touched = touchedPaths({
      features: [{ stencilId: null, label: 'Spa', lengthFt: 8, widthFt: 8, count: 1, x: null, y: null }],
    })
    expect(touched).toContain('features')
    expect(unreviewedFieldPaths(intent, touched)).toEqual([])
  })

  it('clears a nested object leaf', () => {
    const intent = intentWithLowConfidence(['site.setbacksFt.front'])
    const touched = touchedPaths({
      site: { setbacksFt: { front: 10, rear: null, left: null, right: null } },
    })
    expect(touched).toContain('site.setbacksFt.front')
    expect(unreviewedFieldPaths(intent, touched)).toEqual([])
  })

  it('does not let correcting one sibling rubber-stamp another', () => {
    const intent = intentWithLowConfidence(['pool.lengthFt', 'pool.widthFt'])
    const touched = touchedPaths({ pool: { lengthFt: 32 } })

    expect(touched).toEqual(['pool.lengthFt'])
    expect(unreviewedFieldPaths(intent, touched)).toEqual(['pool.widthFt'])
  })

  it('matches whole segments, so a prefix string is not a match', () => {
    expect(pathCoveredBy('pool.length', 'pool.lengthFt')).toBe(false)
    expect(pathCoveredBy('pool', 'pool.lengthFt')).toBe(true)
    expect(pathCoveredBy('pool.lengthFt', 'pool.lengthFt')).toBe(true)
    expect(pathCoveredBy('pool.lengthFt', 'pool')).toBe(false)
  })
})
