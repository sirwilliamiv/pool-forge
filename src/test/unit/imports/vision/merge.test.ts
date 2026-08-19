import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesignIntentSchema, fieldsRequiringReview } from '@/modules/imports/intent'
import {
  KIND_GEOMETRY_RANK,
  mergeContributions,
  type ImageKind,
  type IntentContribution,
  type PartialDesignIntent,
} from '@/modules/imports/vision'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

function contribution(
  sourceImageId: string,
  kind: ImageKind,
  intent: PartialDesignIntent,
  fieldConfidence: Record<string, number> = {},
): IntentContribution {
  return {
    sourceImageId,
    kind,
    extractorVersion: `${kind}@test`,
    intent,
    fieldConfidence,
    warnings: [],
    geometry: null,
    usage: { model: 'test', tokensIn: 0, tokensOut: 0, latencyMs: 0, calls: 1 },
  }
}

describe('merge precedence', () => {
  it('produces a DesignIntent that satisfies the v1 contract', () => {
    const { intent } = mergeContributions([
      contribution('img_a', 'SKETCH', { pool: { shapeFamily: 'rectangle', lengthFt: 32 } }, { 'pool.lengthFt': 0.9 }),
    ])
    expect(() => DesignIntentSchema.parse(intent)).not.toThrow()
    expect(intent.version).toBe(1)
    expect(intent.sourceImageIds).toEqual(['img_a'])
  })

  it("a sketch's geometry beats a concept render's, whatever the confidence says", () => {
    const sketch = contribution(
      'img_sketch',
      'SKETCH',
      { pool: { shapeFamily: 'rectangle', lengthFt: 32, widthFt: 16 } },
      { 'pool.lengthFt': 0.55, 'pool.widthFt': 0.55, 'pool.shapeFamily': 0.55 },
    )
    // A contribution assembled by hand, claiming a dimension it must not have.
    const render = contribution(
      'img_render',
      'CONCEPT_RENDER',
      { pool: { shapeFamily: 'lagoon', lengthFt: 45, widthFt: 22 } },
      { 'pool.lengthFt': 0.99, 'pool.widthFt': 0.99, 'pool.shapeFamily': 0.99 },
    )

    const { intent } = mergeContributions([render, sketch])
    expect(intent.pool.lengthFt).toBe(32)
    expect(intent.pool.widthFt).toBe(16)
    // Shape family is not a measurement, so the more confident read wins there.
    expect(intent.pool.shapeFamily).toBe('lagoon')
  })

  it('a concept render is incapable of contributing any dimension', () => {
    const render = contribution(
      'img_render',
      'CONCEPT_RENDER',
      {
        pool: { shapeFamily: 'oval', lengthFt: 40, widthFt: 20, depthShallowFt: 3, depthDeepFt: 8 },
        deck: { material: 'travertine', widthFt: 6 },
        enclosure: { present: true, kind: 'screen', heightFt: 12 },
        site: { northDeg: 45, setbacksFt: { front: 10, rear: 10, left: 5, right: 5 }, notes: [] },
        features: [{ stencilId: null, label: 'spa', lengthFt: 8, widthFt: 8, count: 1 }],
      },
      { 'pool.lengthFt': 0.95, 'pool.footprint': 0.95, 'scale.pixelsPerInch': 0.95 },
    )

    const { intent } = mergeContributions([render])
    expect(intent.pool.lengthFt).toBeNull()
    expect(intent.pool.widthFt).toBeNull()
    expect(intent.pool.depthShallowFt).toBeNull()
    expect(intent.pool.depthDeepFt).toBeNull()
    expect(intent.deck.widthFt).toBeNull()
    expect(intent.enclosure.heightFt).toBeNull()
    expect(intent.site.northDeg).toBeNull()
    expect(intent.site.setbacksFt).toBeNull()
    expect(intent.pool.footprint).toBeNull()
    expect(intent.scale.pixelsPerInch).toBeNull()
    expect(intent.fieldConfidence['pool.lengthFt']).toBeUndefined()
    expect(intent.fieldConfidence['pool.footprint']).toBeUndefined()
    expect(intent.features[0]?.lengthFt).toBeNull()

    // It still contributes what it is good for.
    expect(intent.pool.shapeFamily).toBe('oval')
    expect(intent.deck.material).toBe('travertine')
    expect(intent.enclosure.present).toBe(true)
    expect(intent.features.map((f) => f.label)).toContain('spa')
  })

  it('a site photo is treated the same way', () => {
    const photo = contribution(
      'img_photo',
      'SITE_PHOTO',
      { pool: { lengthFt: 25 }, site: { notes: ['fence: wood, gate visible'] } },
      { 'pool.lengthFt': 0.9 },
    )
    const { intent } = mergeContributions([photo])
    expect(intent.pool.lengthFt).toBeNull()
    expect(intent.site.notes).toContain('fence: wood, gate visible')
  })

  it('ranks kinds by geometric authority', () => {
    expect(KIND_GEOMETRY_RANK.SKETCH).toBeGreaterThan(KIND_GEOMETRY_RANK.SITE_PLAN)
    expect(KIND_GEOMETRY_RANK.SITE_PLAN).toBeGreaterThan(KIND_GEOMETRY_RANK.SCREENSHOT)
    expect(KIND_GEOMETRY_RANK.SCREENSHOT).toBeGreaterThan(KIND_GEOMETRY_RANK.CONCEPT_RENDER)
    expect(KIND_GEOMETRY_RANK.CONCEPT_RENDER).toBe(0)
    expect(KIND_GEOMETRY_RANK.SITE_PHOTO).toBe(0)
  })

  it('a site plan beats a screenshot on setbacks', () => {
    const plan = contribution(
      'img_plan',
      'SITE_PLAN',
      { site: { setbacksFt: { front: 25, rear: 10, left: null, right: null }, notes: [] } },
      { 'site.setbacksFt': 0.7 },
    )
    const shot = contribution(
      'img_shot',
      'SCREENSHOT',
      { site: { setbacksFt: { front: 20, rear: 8, left: null, right: null }, notes: [] } },
      { 'site.setbacksFt': 0.95 },
    )
    const { intent } = mergeContributions([shot, plan])
    expect(intent.site.setbacksFt?.front).toBe(25)
  })
})

describe('same-kind conflicts', () => {
  it('resolves by confidence and warns naming both images', () => {
    const a = contribution('img_a', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.9 })
    const b = contribution('img_b', 'SKETCH', { pool: { lengthFt: 28 } }, { 'pool.lengthFt': 0.62 })

    const { intent } = mergeContributions([b, a])
    expect(intent.pool.lengthFt).toBe(32)
    expect(intent.fieldConfidence['pool.lengthFt']).toBeCloseTo(0.9)

    const conflict = intent.warnings.find((w) => w.startsWith('pool.lengthFt:'))
    expect(conflict).toBeDefined()
    expect(conflict).toContain('img_a')
    expect(conflict).toContain('img_b')
    expect(conflict).toContain('32')
    expect(conflict).toContain('28')
  })

  it('stays silent when two images of the same kind agree', () => {
    const a = contribution('img_a', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.9 })
    const b = contribution('img_b', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.6 })
    const { intent } = mergeContributions([a, b])
    expect(intent.warnings.filter((w) => w.startsWith('pool.lengthFt:'))).toHaveLength(0)
  })

  it('names both images and the reason when kinds differ', () => {
    const sketch = contribution('img_sketch', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.5 })
    const plan = contribution('img_plan', 'SITE_PLAN', { pool: { lengthFt: 30 } }, { 'pool.lengthFt': 0.95 })
    const { intent } = mergeContributions([plan, sketch])
    expect(intent.pool.lengthFt).toBe(32)
    const conflict = intent.warnings.find((w) => w.startsWith('pool.lengthFt:'))
    expect(conflict).toContain('img_sketch')
    expect(conflict).toContain('img_plan')
    expect(conflict).toContain('SKETCH')
  })

  it('is deterministic when confidence and kind tie', () => {
    const a = contribution('img_a', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.8 })
    const b = contribution('img_b', 'SKETCH', { pool: { lengthFt: 28 } }, { 'pool.lengthFt': 0.8 })
    expect(mergeContributions([a, b]).intent.pool.lengthFt).toBe(32)
    expect(mergeContributions([b, a]).intent.pool.lengthFt).toBe(32)
  })
})

describe('feature and note merging', () => {
  it('unions features across images and keeps the larger count', () => {
    const sketch = contribution(
      'img_sketch',
      'SKETCH',
      {
        features: [
          { stencilId: null, label: 'Spa', lengthFt: 7, widthFt: 7, count: 1 },
          { stencilId: null, label: 'entry steps', lengthFt: null, widthFt: null, count: 1 },
        ],
      },
      { 'features.0.label': 0.9, 'features.1.label': 0.8 },
    )
    const render = contribution(
      'img_render',
      'CONCEPT_RENDER',
      {
        features: [
          { stencilId: null, label: 'spa', lengthFt: null, widthFt: null, count: 2 },
          { stencilId: null, label: 'fire bowl', lengthFt: null, widthFt: null, count: 2 },
        ],
      },
      { 'features.0.label': 0.7, 'features.1.label': 0.85 },
    )

    const { intent } = mergeContributions([sketch, render])
    const labels = intent.features.map((f) => f.label.toLowerCase())
    expect(labels).toContain('spa')
    expect(labels).toContain('entry steps')
    expect(labels).toContain('fire bowl')
    expect(labels.filter((l) => l === 'spa')).toHaveLength(1)

    const spa = intent.features.find((f) => f.label.toLowerCase() === 'spa')
    expect(spa?.count).toBe(2)
    // The sketch's dimensions survive; the render contributed none.
    expect(spa?.lengthFt).toBe(7)

    const fireBowl = intent.features.find((f) => f.label === 'fire bowl')
    expect(fireBowl?.lengthFt).toBeNull()
    expect(intent.warnings.some((w) => w.includes('disagree on the count'))).toBe(true)
  })

  it('re-indexes feature confidence onto the merged list', () => {
    const { intent } = mergeContributions([
      contribution(
        'img_a',
        'SKETCH',
        { features: [{ stencilId: null, label: 'spa', lengthFt: null, widthFt: null, count: 1 }] },
        { 'features.0.label': 0.9 },
      ),
    ])
    expect(intent.fieldConfidence['features.0.label']).toBeCloseTo(0.9)
    expect(intent.features).toHaveLength(1)
  })

  it('concatenates notes from every image without duplicating them', () => {
    const a = contribution('img_a', 'SITE_PHOTO', { site: { notes: ['ground cover: grass', 'slope: flat'] } })
    const b = contribution('img_b', 'SITE_PHOTO', { site: { notes: ['slope: flat', 'obstacle: tree'] } })
    const { intent } = mergeContributions([a, b])
    expect(intent.site.notes).toEqual(['ground cover: grass', 'slope: flat', 'obstacle: tree'])
  })

  it('carries every contribution warning into the merged intent', () => {
    const a = { ...contribution('img_a', 'SKETCH', {}), warnings: ['first warning'] }
    const b = { ...contribution('img_b', 'SKETCH', {}), warnings: ['second warning'] }
    const { intent } = mergeContributions([a, b])
    expect(intent.warnings).toContain('first warning')
    expect(intent.warnings).toContain('second warning')
  })
})

describe('merge output plumbing', () => {
  it('hands the precision layer the geometry keyed by source image', () => {
    const sketch: IntentContribution = {
      ...contribution('img_sketch', 'SKETCH', {}),
      geometry: {
        source: 'sketch',
        poolPolygonNormalized: [],
        dimensions: [],
        scaleLegend: null,
        gridVisible: true,
      },
    }
    const { geometryBySource } = mergeContributions([sketch, contribution('img_render', 'CONCEPT_RENDER', {})])
    expect(Object.keys(geometryBySource)).toEqual(['img_sketch'])
    expect(geometryBySource.img_sketch?.source).toBe('sketch')
  })

  it('carries footprint confidence through for the review UI to badge', () => {
    const { intent } = mergeContributions([
      contribution('img_a', 'SKETCH', {}, { 'pool.footprint': 0.45 }),
      contribution('img_b', 'CONCEPT_RENDER', {}, { 'pool.footprint': 0.99 }),
    ])
    expect(intent.fieldConfidence['pool.footprint']).toBeCloseTo(0.45)
    expect(fieldsRequiringReview(intent)).toContain('pool.footprint')
  })

  it('leaves scale unresolved: vision never produces pixels per inch', () => {
    const { intent } = mergeContributions([
      contribution('img_a', 'SKETCH', { pool: { lengthFt: 32 } }, { 'pool.lengthFt': 0.9 }),
    ])
    expect(intent.scale.pixelsPerInch).toBeNull()
    expect(intent.scale.method).toBeNull()
  })

  it('merges nothing into a valid empty intent', () => {
    const { intent } = mergeContributions([])
    expect(() => DesignIntentSchema.parse(intent)).not.toThrow()
    expect(intent.sourceImageIds).toEqual([])
    expect(intent.features).toEqual([])
  })
})
