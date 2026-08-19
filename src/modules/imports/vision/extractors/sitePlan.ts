// SITE_PLAN extractor. Property boundary, house footprint, setbacks, scale bar,
// north arrow.

import { z } from 'zod'
import type { VisionClient } from '../client'
import { SITE_PLAN_EXTRACTOR_VERSION, SITE_PLAN_PROMPT } from '../prompts/sitePlan'
import { runStructuredCall, type StructuredCallResult } from '../runner'
import {
  NormalizedPointSchema,
  toPixels,
  type AnalysisRecord,
  type IntentContribution,
  type PartialDesignIntent,
  type SitePlanGeometry,
  type VisionImage,
} from '../types'
import { parseDimension } from '../dimensions'
import {
  buildAnnotations,
  clampConfidence,
  ConfidenceScoreSchema,
  densifyPolygon,
  DimensionEntrySchema,
  ModelPolygonSchema,
} from './shared'

/** Plats and permit sheets in these markets print feet. */
const SITE_PLAN_DEFAULT_UNIT = 'ft' as const

export const SETBACK_SIDES = ['front', 'rear', 'left', 'right'] as const
export const SetbackSideSchema = z.enum(SETBACK_SIDES)
export type SetbackSide = z.infer<typeof SetbackSideSchema>

export const SitePlanResponseSchema = z.object({
  propertyBoundary: z.array(NormalizedPointSchema).min(3).max(40).nullable(),
  houseFootprint: z.array(NormalizedPointSchema).min(3).max(40).nullable(),
  poolPolygon: ModelPolygonSchema.nullable(),
  scaleBar: z
    .object({
      p1: NormalizedPointSchema,
      p2: NormalizedPointSchema,
      labelText: z.string().min(1),
    })
    .nullable(),
  printedScaleText: z.string().nullable(),
  northArrow: z
    .object({
      from: NormalizedPointSchema,
      to: NormalizedPointSchema,
    })
    .nullable(),
  setbacks: z
    .array(
      z.object({
        side: SetbackSideSchema.nullable(),
        text: z.string().min(1),
        p1: NormalizedPointSchema,
        p2: NormalizedPointSchema,
      }),
    )
    .max(20),
  dimensions: z.array(DimensionEntrySchema).max(60),
  notes: z.array(z.string()).max(30),
  confidence: z.object({
    propertyBoundary: ConfidenceScoreSchema,
    houseFootprint: ConfidenceScoreSchema,
    scale: ConfidenceScoreSchema,
    setbacks: ConfidenceScoreSchema,
    north: ConfidenceScoreSchema,
  }),
})
export type SitePlanResponse = z.infer<typeof SitePlanResponseSchema>

export interface SitePlanExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
}

export interface SitePlanExtraction {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
}

export async function extractSitePlan(options: SitePlanExtractOptions): Promise<SitePlanExtraction> {
  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: SITE_PLAN_PROMPT,
    extractorVersion: SITE_PLAN_EXTRACTOR_VERSION,
    schema: SitePlanResponseSchema,
    image: options.image,
    stage: 'EXTRACT',
    temperature: 0,
  })
  return buildSitePlanExtraction(result, options.image, 'SITE_PLAN')
}

/**
 * Degrees clockwise from the image's +Y axis (down the page) to the direction
 * the north arrow points. Matches `DesignIntent.site.northDeg`.
 */
export function northDegreesFrom(from: { x: number; y: number }, to: { x: number; y: number }): number | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return null
  // atan2 measured from +Y (down the page), turning clockwise in image space.
  const radians = Math.atan2(dx, dy)
  const degrees = (radians * 180) / Math.PI
  return ((degrees % 360) + 360) % 360
}

export function buildSitePlanExtraction(
  result: StructuredCallResult<SitePlanResponse>,
  image: VisionImage,
  kind: 'SITE_PLAN' | 'SCREENSHOT',
): SitePlanExtraction {
  const response = result.data
  const warnings: string[] = []

  const annotationBuild = buildAnnotations(response.dimensions, image, SITE_PLAN_DEFAULT_UNIT)
  warnings.push(...annotationBuild.warnings)

  const setbackBuild = buildAnnotations(
    response.setbacks.map((setback) => ({
      p1: setback.p1,
      p2: setback.p2,
      text: setback.text,
      appliesTo: 'setback' as const,
    })),
    image,
    SITE_PLAN_DEFAULT_UNIT,
  )
  warnings.push(...setbackBuild.warnings)

  let scaleBar: SitePlanGeometry['scaleBar'] = null
  if (response.scaleBar !== null) {
    const parsed = parseDimension(response.scaleBar.labelText, { defaultUnit: SITE_PLAN_DEFAULT_UNIT })
    if (parsed.inches === null) {
      warnings.push(
        `The scale bar on image ${image.sourceImageId} is labelled "${response.scaleBar.labelText}", which did not parse; the plan cannot be scaled from it.`,
      )
    }
    scaleBar = {
      p1: toPixels(response.scaleBar.p1, image.widthPx, image.heightPx),
      p2: toPixels(response.scaleBar.p2, image.widthPx, image.heightPx),
      labelText: response.scaleBar.labelText,
      parsedInches: parsed.inches,
    }
  } else if (response.printedScaleText !== null) {
    warnings.push(
      `Image ${image.sourceImageId} prints the scale as "${response.printedScaleText}" with no bar drawn; the sheet must be calibrated manually since a scan has no reliable print size.`,
    )
  } else {
    warnings.push(`No scale reference was found on image ${image.sourceImageId}.`)
  }

  const boundary = response.propertyBoundary === null ? null : densifyPolygon(response.propertyBoundary).points
  const house = response.houseFootprint === null ? null : densifyPolygon(response.houseFootprint).points
  const pool = response.poolPolygon === null || response.poolPolygon.length === 0
    ? null
    : densifyPolygon(response.poolPolygon).points

  let northArrow: SitePlanGeometry['northArrow'] = null
  let northDeg: number | null = null
  if (response.northArrow !== null) {
    northDeg = northDegreesFrom(response.northArrow.from, response.northArrow.to)
    if (northDeg !== null) {
      northArrow = {
        from: toPixels(response.northArrow.from, image.widthPx, image.heightPx),
        to: toPixels(response.northArrow.to, image.widthPx, image.heightPx),
        degrees: northDeg,
      }
    }
  }

  const geometry: SitePlanGeometry = {
    source: 'sitePlan',
    propertyBoundaryNormalized: boundary,
    houseFootprintNormalized: house,
    poolPolygonNormalized: pool,
    dimensions: [...annotationBuild.annotations, ...setbackBuild.annotations],
    scaleBar,
    northArrow,
  }

  const setbacksFt = collectSetbacks(response.setbacks)

  const intent: PartialDesignIntent = {
    site: {
      northDeg,
      notes: response.notes,
    },
  }
  if (setbacksFt !== null) {
    intent.site = { ...intent.site, setbacksFt }
  }

  const scores = response.confidence
  const fieldConfidence: Record<string, number> = {}
  if (boundary !== null) fieldConfidence['site.propertyBoundary'] = clampConfidence(scores.propertyBoundary)
  if (house !== null) fieldConfidence['site.houseFootprint'] = clampConfidence(scores.houseFootprint)
  if (setbacksFt !== null) fieldConfidence['site.setbacksFt'] = clampConfidence(scores.setbacks)
  if (northDeg !== null) fieldConfidence['site.northDeg'] = clampConfidence(scores.north)
  if (pool !== null) fieldConfidence['pool.footprint'] = clampConfidence(scores.scale)
  if (scaleBar !== null && scaleBar.parsedInches !== null) {
    fieldConfidence['scale.pixelsPerInch'] = clampConfidence(scores.scale)
  }

  return {
    contribution: {
      sourceImageId: image.sourceImageId,
      kind,
      extractorVersion: SITE_PLAN_EXTRACTOR_VERSION,
      intent,
      fieldConfidence,
      warnings,
      geometry,
      usage: result.usage,
    },
    analysis: result.analysis,
    repaired: result.repaired,
  }
}

type Setbacks = { front: number | null; rear: number | null; left: number | null; right: number | null }

function collectSetbacks(entries: SitePlanResponse['setbacks']): Setbacks | null {
  const result: Setbacks = { front: null, rear: null, left: null, right: null }
  let any = false
  for (const entry of entries) {
    if (entry.side === null) continue
    const parsed = parseDimension(entry.text, { defaultUnit: SITE_PLAN_DEFAULT_UNIT })
    if (parsed.inches === null) continue
    if (result[entry.side] !== null) continue
    result[entry.side] = parsed.inches / 12
    any = true
  }
  return any ? result : null
}
