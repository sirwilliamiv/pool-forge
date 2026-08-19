import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyImage,
  createRecordedClient,
  extractConceptRender,
  extractForKind,
  extractScreenshot,
  extractSitePhoto,
  extractSitePlan,
  extractSketch,
  FORBIDDEN_CONCEPT_PATHS,
  routeScreenshot,
  VisionError,
  type ClassificationResult,
} from '@/modules/imports/vision'
import { fixture, testImage } from './helpers'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

const image = testImage()
const MODEL = 'gemini-2.5-pro'

function classification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    kind: overrides.kind ?? 'SKETCH',
    rotationDeg: overrides.rotationDeg ?? 0,
    qualityFlags: overrides.qualityFlags ?? [],
    confidence: overrides.confidence ?? 0.9,
  }
}

describe('classify', () => {
  it('reads kind, rotation, flags and confidence', async () => {
    const client = createRecordedClient([fixture('classify-sketch')])
    const result = await classifyImage({ client, image, model: 'gemini-2.5-flash' })
    expect(result.kind).toBe('SKETCH')
    expect(result.rotationDeg).toBe(0)
    expect(result.qualityFlags).toEqual(['glare'])
    expect(result.confidence).toBeCloseTo(0.94)
    expect(result.analysis.stage).toBe('CLASSIFY')
  })

  it('rejects a rotation that is not a quarter turn, then repairs', async () => {
    const client = createRecordedClient([
      '{"kind":"SKETCH","rotationDeg":37,"qualityFlags":[],"confidence":0.9}',
      fixture('classify-sketch'),
    ])
    const result = await classifyImage({ client, image, model: 'gemini-2.5-flash' })
    expect(client.callCount).toBe(2)
    expect(result.repaired).toBe(true)
  })

  it('rejects a quality flag outside the vocabulary', async () => {
    const client = createRecordedClient([
      '{"kind":"SKETCH","rotationDeg":0,"qualityFlags":["kinda-fuzzy"],"confidence":0.9}',
      fixture('classify-sketch'),
    ])
    await classifyImage({ client, image, model: 'gemini-2.5-flash' })
    expect(client.callCount).toBe(2)
  })
})

describe('sketch extractor', () => {
  it('produces the geometry payload in normalized and pixel space', async () => {
    const client = createRecordedClient([fixture('sketch-good')])
    const { contribution } = await extractSketch({ client, image, model: MODEL })

    expect(contribution.kind).toBe('SKETCH')
    expect(contribution.extractorVersion).toMatch(/^sketch@/)
    const geometry = contribution.geometry
    expect(geometry?.source).toBe('sketch')
    if (geometry?.source !== 'sketch') throw new Error('expected sketch geometry')

    expect(geometry.poolPolygonNormalized.length).toBeGreaterThanOrEqual(8)
    expect(geometry.poolPolygonNormalized.length).toBeLessThanOrEqual(40)
    for (const point of geometry.poolPolygonNormalized) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    }

    // Dimension endpoints come back in pixels, derived from the known size.
    const length = geometry.dimensions.find((d) => d.appliesTo === 'pool-length')
    expect(length?.p1.x).toBeCloseTo(0.22 * image.widthPx, 3)
    expect(length?.p2.x).toBeCloseTo(0.76 * image.widthPx, 3)
    expect(length?.textValue).toBe("32'")
    expect(length?.parsedInches).toBe(384)

    expect(geometry.gridVisible).toBe(true)
    expect(geometry.scaleLegend?.text).toBe('1 square = 1 ft')
    expect(geometry.scaleLegend?.unitsPerSquare).toBe(1)
    expect(geometry.scaleLegend?.unit).toBe('ft')
  })

  it('derives intent fields from the text it read, not from pixels', async () => {
    const client = createRecordedClient([fixture('sketch-good')])
    const { contribution } = await extractSketch({ client, image, model: MODEL })
    expect(contribution.intent.pool?.shapeFamily).toBe('rectangle')
    expect(contribution.intent.pool?.lengthFt).toBe(32)
    expect(contribution.intent.pool?.widthFt).toBe(16)
    expect(contribution.intent.pool?.depthShallowFt).toBe(3)
    expect(contribution.intent.pool?.depthDeepFt).toBeCloseTo(6.5)
    expect(contribution.intent.deck?.material).toBe('paver')
    expect(contribution.intent.deck?.widthFt).toBeCloseTo(4.5)
    expect(contribution.intent.features?.map((f) => f.label)).toContain('spa')
    expect(contribution.fieldConfidence['pool.lengthFt']).toBeCloseTo(0.93)
    expect(contribution.fieldConfidence['pool.footprint']).toBeCloseTo(0.9)
  })

  it('leaves an unparseable dimension null and warns naming the image', async () => {
    const client = createRecordedClient([fixture('sketch-unparseable-dimension')])
    const { contribution } = await extractSketch({ client, image, model: MODEL })

    const geometry = contribution.geometry
    if (geometry?.source !== 'sketch') throw new Error('expected sketch geometry')

    const bad = geometry.dimensions.find((d) => d.textValue === 'about thirty-ish')
    expect(bad).toBeDefined()
    expect(bad?.parsedInches).toBeNull()
    expect(contribution.intent.pool?.lengthFt).toBeNull()
    expect(contribution.fieldConfidence['pool.lengthFt']).toBeUndefined()
    expect(contribution.warnings.some((w) => w.includes('about thirty-ish') && w.includes('img_a'))).toBe(true)
  })

  it('assumes feet for a bare number, says so, and lowers the confidence', async () => {
    const client = createRecordedClient([fixture('sketch-unparseable-dimension')])
    const { contribution } = await extractSketch({ client, image, model: MODEL })
    expect(contribution.intent.pool?.widthFt).toBe(14)
    expect(contribution.warnings.some((w) => w.includes('no unit written'))).toBe(true)
    // 0.55 stated minus the 0.15 penalty for the assumption.
    expect(contribution.fieldConfidence['pool.widthFt']).toBeCloseTo(0.4)
  })

  it('subdivides a four point rectangle up to the contract minimum', async () => {
    const fourPoints = JSON.stringify({
      ...JSON.parse(fixture('sketch-good')),
      poolPolygon: [
        { x: 0.2, y: 0.3 },
        { x: 0.8, y: 0.3 },
        { x: 0.8, y: 0.7 },
        { x: 0.2, y: 0.7 },
      ],
    })
    const client = createRecordedClient([fourPoints])
    const { contribution } = await extractSketch({ client, image, model: MODEL })
    expect(client.callCount).toBe(1)
    const geometry = contribution.geometry
    if (geometry?.source !== 'sketch') throw new Error('expected sketch geometry')
    expect(geometry.poolPolygonNormalized).toHaveLength(8)
    expect(contribution.warnings.some((w) => w.includes('subdivided'))).toBe(true)
  })
})

describe('concept render extractor', () => {
  it('produces intent and no measurement of any kind', async () => {
    const client = createRecordedClient([fixture('concept-render-good')])
    const { contribution } = await extractConceptRender({ client, image, model: MODEL })

    expect(contribution.intent.pool?.shapeFamily).toBe('lagoon')
    expect(contribution.intent.materials?.interiorFinish).toBe('blue pebble')
    expect(contribution.geometry).toBeNull()
    expect(contribution.intent.pool).not.toHaveProperty('lengthFt')
    expect(contribution.intent.pool).not.toHaveProperty('widthFt')
    for (const feature of contribution.intent.features ?? []) {
      expect(feature.lengthFt).toBeNull()
      expect(feature.widthFt).toBeNull()
    }
    for (const path of FORBIDDEN_CONCEPT_PATHS) {
      expect(contribution.fieldConfidence[path]).toBeUndefined()
    }
  })

  it('discards dimensions the model invented anyway', async () => {
    const client = createRecordedClient([fixture('concept-render-with-dimensions')])
    const { contribution } = await extractConceptRender({ client, image, model: MODEL })

    // The fixture contains lengthFt, widthFt, depths, a polygon and a scale.
    const serialized = JSON.stringify(contribution)
    expect(serialized).not.toContain('lengthFt":30')
    expect(serialized).not.toContain('pixelsPerInch')
    expect(contribution.geometry).toBeNull()
    expect(contribution.intent.pool).toEqual({ shapeFamily: 'rectangle' })
    expect(contribution.intent.enclosure?.present).toBe(true)
    expect(contribution.intent.enclosure).not.toHaveProperty('heightFt')
  })

  it('warns the reviewer that nothing on the image is real size', async () => {
    const client = createRecordedClient([fixture('concept-render-good')])
    const { contribution } = await extractConceptRender({ client, image, model: MODEL })
    expect(contribution.warnings.some((w) => w.includes('No size on it is real'))).toBe(true)
  })
})

describe('site plan extractor', () => {
  it('reads boundary, house, setbacks, scale bar and north', async () => {
    const client = createRecordedClient([fixture('site-plan-good')])
    const { contribution } = await extractSitePlan({ client, image, model: MODEL })

    const geometry = contribution.geometry
    if (geometry?.source !== 'sitePlan') throw new Error('expected site plan geometry')

    expect(geometry.propertyBoundaryNormalized).toHaveLength(8)
    expect(geometry.houseFootprintNormalized).toHaveLength(8)
    expect(geometry.scaleBar?.labelText).toBe("20'")
    expect(geometry.scaleBar?.parsedInches).toBe(240)
    expect(geometry.scaleBar?.p1.x).toBeCloseTo(0.7 * image.widthPx, 3)
    // The arrow points up the page, which is 180 degrees from +Y.
    expect(geometry.northArrow?.degrees).toBeCloseTo(180)
    expect(contribution.intent.site?.northDeg).toBeCloseTo(180)
    expect(contribution.intent.site?.setbacksFt?.front).toBe(25)
    expect(contribution.intent.site?.setbacksFt?.rear).toBe(10)
    expect(contribution.intent.site?.setbacksFt?.left).toBeNull()
    expect(contribution.fieldConfidence['scale.pixelsPerInch']).toBeCloseTo(0.9)
  })

  it('warns and claims no scale when only a ratio is printed', async () => {
    const client = createRecordedClient([fixture('site-plan-no-scale')])
    const { contribution } = await extractSitePlan({ client, image, model: MODEL })
    const geometry = contribution.geometry
    if (geometry?.source !== 'sitePlan') throw new Error('expected site plan geometry')
    expect(geometry.scaleBar).toBeNull()
    expect(contribution.fieldConfidence['scale.pixelsPerInch']).toBeUndefined()
    expect(contribution.warnings.some((w) => w.includes('calibrated manually'))).toBe(true)
  })
})

describe('site photo extractor', () => {
  it('records conditions as notes and no geometry', async () => {
    const client = createRecordedClient([fixture('site-photo-good')])
    const { contribution } = await extractSitePhoto({ client, image, model: MODEL })
    expect(contribution.geometry).toBeNull()
    expect(contribution.intent.site?.notes?.some((n) => n.startsWith('house wall'))).toBe(true)
    expect(contribution.intent.site?.notes?.some((n) => n.startsWith('equipment access'))).toBe(true)
    expect(contribution.intent.site?.notes?.some((n) => n.startsWith('obstacle'))).toBe(true)
    expect(contribution.intent.features?.map((f) => f.label)).toContain('AC unit')
    expect(contribution.intent.pool).toBeUndefined()
  })
})

describe('screenshot routing', () => {
  it('routes to the site plan extractor when a scale reference exists', async () => {
    const client = createRecordedClient([fixture('site-plan-good')])
    const result = await extractScreenshot({
      client,
      image,
      model: MODEL,
      classification: classification({ kind: 'SCREENSHOT', qualityFlags: ['cropped-edges'] }),
    })
    expect(result.route).toBe('sitePlan')
    expect(result.contribution.kind).toBe('SCREENSHOT')
    expect(result.contribution.geometry?.source).toBe('sitePlan')
  })

  it('routes to the concept render extractor when nothing establishes size', async () => {
    const client = createRecordedClient([fixture('concept-render-good')])
    const result = await extractScreenshot({
      client,
      image,
      model: MODEL,
      classification: classification({ kind: 'SCREENSHOT', qualityFlags: ['no-scale-reference'] }),
    })
    expect(result.route).toBe('conceptRender')
    expect(result.contribution.geometry).toBeNull()
    expect(result.contribution.warnings.some((w) => w.includes('intent only'))).toBe(true)
  })

  it('demotes a plan whose promised scale bar turned out not to be there', async () => {
    const client = createRecordedClient([fixture('site-plan-no-scale')])
    const result = await extractScreenshot({
      client,
      image,
      model: MODEL,
      classification: classification({ kind: 'SCREENSHOT', qualityFlags: [] }),
    })
    expect(result.route).toBe('conceptRender')
    expect(result.contribution.geometry).toBeNull()
    expect(result.contribution.intent.site?.setbacksFt).toBeUndefined()
    expect(result.contribution.warnings.some((w) => w.includes('geometry was discarded'))).toBe(true)
  })

  it('decides the route before any call is made', () => {
    expect(routeScreenshot(classification({ qualityFlags: ['no-scale-reference'] }))).toBe('conceptRender')
    expect(routeScreenshot(classification({ qualityFlags: ['blurry'] }))).toBe('sitePlan')
  })
})

describe('dispatch', () => {
  it('sends each kind to its extractor', async () => {
    const cases: [ClassificationResult['kind'], string][] = [
      ['SKETCH', 'sketch-good'],
      ['SITE_PLAN', 'site-plan-good'],
      ['CONCEPT_RENDER', 'concept-render-good'],
      ['SITE_PHOTO', 'site-photo-good'],
    ]
    for (const [kind, name] of cases) {
      const client = createRecordedClient([fixture(name)])
      const outcome = await extractForKind({
        client,
        image,
        model: MODEL,
        classification: classification({ kind }),
      })
      expect(outcome.contribution.kind).toBe(kind)
    }
  })

  it('refuses to guess at an unclassifiable image', async () => {
    const client = createRecordedClient([])
    const error = await extractForKind({
      client,
      image,
      model: MODEL,
      classification: classification({ kind: 'UNKNOWN' }),
    }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(VisionError)
    expect((error as VisionError).code).toBe('unsupported')
    expect(client.callCount).toBe(0)
  })
})
