// The review overlay drew nothing until a scale existed, so a user was asked to
// trust an extraction they could not see. The extractor reports the outline in
// normalized image coordinates, which need no scale at all: it was simply being
// discarded after the precision step.

import { describe, expect, it } from 'vitest'

import {
  DesignIntentSchema,
  emptyDesignIntent,
  hasResolvedScale,
  type DesignIntent,
} from '@/modules/imports/intent'
import { applyIntentPatch } from '@/modules/imports/patch'

function intentWithOutline(): DesignIntent {
  return {
    ...emptyDesignIntent(['img-1']),
    imageSpace: {
      sourceImageId: 'img-1',
      poolPolygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.6, y: 0.1 },
        { x: 0.6, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      gridVisible: true,
    },
  }
}

describe('image-space geometry', () => {
  it('survives an unresolved scale, which is the whole point', () => {
    const intent = intentWithOutline()
    expect(hasResolvedScale(intent)).toBe(false)
    expect(intent.pool.footprint).toBeNull()
    // Nothing measurable exists yet, but there is still something to look at.
    expect(intent.imageSpace?.poolPolygon).toHaveLength(4)
  })

  it('round-trips through the schema', () => {
    const parsed = DesignIntentSchema.parse(JSON.parse(JSON.stringify(intentWithOutline())))
    expect(parsed.imageSpace?.poolPolygon).toHaveLength(4)
    expect(parsed.imageSpace?.gridVisible).toBe(true)
  })

  it('defaults to null on a document written before the field existed', () => {
    const legacy = JSON.parse(JSON.stringify(emptyDesignIntent(['img-1']))) as Record<string, unknown>
    delete legacy['imageSpace']
    expect(DesignIntentSchema.parse(legacy).imageSpace).toBeNull()
  })

  it('is not clobbered by a human edit', () => {
    const patched = applyIntentPatch(intentWithOutline(), { pool: { lengthFt: 32 } })
    expect(patched.pool.lengthFt).toBe(32)
    expect(patched.imageSpace?.poolPolygon).toHaveLength(4)
  })

  it('stays normalized, so it maps onto any rendered size', () => {
    for (const point of intentWithOutline().imageSpace?.poolPolygon ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    }
  })
})
