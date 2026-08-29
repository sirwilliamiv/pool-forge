// SKETCH extractor. The geometry payload.
//
// The model supplies a coarse outline in normalized coordinates, the literal
// text of every dimension it can read, and any scale legend. Every number is
// produced here by the deterministic parser; the precision layer turns the
// normalized outline into inches once it has resolved a scale.

import { z } from 'zod'
import {
  DeckMaterialSchema,
  EnclosureKindSchema,
  MaterialsIntentSchema,
  ShapeFamilySchema,
} from '@/modules/imports/intent'
import type { VisionClient } from '../client'
import { parseScaleLegend } from '../dimensions'
import { SKETCH_EXTRACTOR_VERSION, SKETCH_PROMPT } from '../prompts/sketch'
import { runStructuredCall, type StructuredCallResult } from '../runner'
import type {
  AnalysisRecord,
  IntentContribution,
  PartialDesignIntent,
  ScaleLegend,
  SketchGeometry,
  VisionImage,
} from '../types'
import {
  buildAnnotations,
  clampConfidence,
  ConfidenceScoreSchema,
  dedupeFeatures,
  densifyPolygon,
  depthFeet,
  DimensionEntrySchema,
  feetFor,
  ModelPolygonSchema,
  penalize,
} from './shared'

/** Sketches are dimensioned in feet in every market this ships to. */
const SKETCH_DEFAULT_UNIT = 'ft' as const

export const SketchResponseSchema = z.object({
  shapeFamily: ShapeFamilySchema,
  poolPolygon: ModelPolygonSchema,
  gridVisible: z.boolean(),
  scaleLegendText: z.string().nullable(),
  dimensions: z.array(DimensionEntrySchema).max(60),
  depths: z.object({
    shallowText: z.string().nullable(),
    deepText: z.string().nullable(),
  }),
  features: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        count: z.number().int().positive().max(99),
        lengthText: z.string().nullable(),
        widthText: z.string().nullable(),
      }),
    )
    .max(40),
  deck: z.object({
    material: DeckMaterialSchema,
    widthText: z.string().nullable(),
  }),
  enclosure: z.object({
    present: z.boolean(),
    kind: EnclosureKindSchema,
    heightText: z.string().nullable(),
  }),
  materials: MaterialsIntentSchema,
  notes: z.array(z.string()).max(30),
  confidence: z.object({
    shapeFamily: ConfidenceScoreSchema,
    polygon: ConfidenceScoreSchema,
    dimensions: ConfidenceScoreSchema,
    depths: ConfidenceScoreSchema,
    features: ConfidenceScoreSchema,
    materials: ConfidenceScoreSchema,
  }),
})
export type SketchResponse = z.infer<typeof SketchResponseSchema>

export interface SketchExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
}

export interface SketchExtraction {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
}

export async function extractSketch(options: SketchExtractOptions): Promise<SketchExtraction> {
  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: SKETCH_PROMPT,
    extractorVersion: SKETCH_EXTRACTOR_VERSION,
    schema: SketchResponseSchema,
    image: options.image,
    stage: 'EXTRACT',
    temperature: 0,
  })
  return buildSketchExtraction(result, options.image)
}

/** Pure part, split out so fixtures exercise it without a client. */
export function buildSketchExtraction(
  result: StructuredCallResult<SketchResponse>,
  image: VisionImage,
): SketchExtraction {
  const response = result.data
  const warnings: string[] = []

  const annotationBuild = buildAnnotations(response.dimensions, image, SKETCH_DEFAULT_UNIT)
  warnings.push(...annotationBuild.warnings)

  const polygon = densifyPolygon(response.poolPolygon)
  if (polygon.densified) {
    warnings.push(
      `The outline on image ${image.sourceImageId} arrived with ${response.poolPolygon.length} points; it was subdivided to ${polygon.points.length} so the precision layer can simplify it.`,
    )
  }
  if (response.poolPolygon.length === 0) {
    warnings.push(`No pool outline was traced on image ${image.sourceImageId}.`)
  }

  let scaleLegend: ScaleLegend | null = null
  if (response.scaleLegendText !== null && response.scaleLegendText.trim() !== '') {
    const parsed = parseScaleLegend(response.scaleLegendText)
    scaleLegend = {
      text: response.scaleLegendText,
      unitsPerSquare: parsed === null ? null : parsed.unitsPerSquare,
      unit: parsed === null ? null : parsed.unit,
    }
    if (parsed === null) {
      warnings.push(
        `The scale legend "${response.scaleLegendText}" on image ${image.sourceImageId} could not be read as a per-square scale.`,
      )
    }
  }

  const geometry: SketchGeometry = {
    source: 'sketch',
    poolPolygonNormalized: polygon.points,
    dimensions: annotationBuild.annotations,
    scaleLegend,
    gridVisible: response.gridVisible,
  }

  const lengthFt = feetFor(annotationBuild.annotations, 'pool-length')
  const widthFt = feetFor(annotationBuild.annotations, 'pool-width')
  const deckWidthFt =
    depthFeet(response.deck.widthText, SKETCH_DEFAULT_UNIT) ??
    feetFor(annotationBuild.annotations, 'deck-width')

  const features = dedupeFeatures(
    response.features.map((feature) => ({
      label: feature.label,
      count: feature.count,
      lengthFt: depthFeet(feature.lengthText, SKETCH_DEFAULT_UNIT),
      widthFt: depthFeet(feature.widthText, SKETCH_DEFAULT_UNIT),
    })),
  )

  const intent: PartialDesignIntent = {
    pool: {
      shapeFamily: response.shapeFamily,
      lengthFt,
      widthFt,
      depthShallowFt: depthFeet(response.depths.shallowText, SKETCH_DEFAULT_UNIT),
      depthDeepFt: depthFeet(response.depths.deepText, SKETCH_DEFAULT_UNIT),
    },
    features: features.map((feature) => ({
      stencilId: null,
      label: feature.label,
      lengthFt: feature.lengthFt,
      widthFt: feature.widthFt,
      count: feature.count,
    })),
    deck: {
      material: response.deck.material,
      widthFt: deckWidthFt,
    },
    enclosure: {
      present: response.enclosure.present,
      kind: response.enclosure.kind,
      heightFt: depthFeet(response.enclosure.heightText, SKETCH_DEFAULT_UNIT),
    },
    site: { notes: response.notes },
    materials: response.materials,
  }

  const scores = response.confidence
  const unitPenalty = annotationBuild.assumedUnits ? 0.15 : 0
  const dimensionScore = penalize(scores.dimensions, unitPenalty)

  const fieldConfidence: Record<string, number> = {
    'pool.shapeFamily': clampConfidence(scores.shapeFamily),
  }
  if (polygon.points.length > 0) {
    fieldConfidence['pool.footprint'] = penalize(scores.polygon, polygon.densified ? 0.1 : 0)
  }
  if (lengthFt !== null) fieldConfidence['pool.lengthFt'] = dimensionScore
  if (widthFt !== null) fieldConfidence['pool.widthFt'] = dimensionScore
  if (intent.pool?.depthShallowFt != null) fieldConfidence['pool.depthShallowFt'] = clampConfidence(scores.depths)
  if (intent.pool?.depthDeepFt != null) fieldConfidence['pool.depthDeepFt'] = clampConfidence(scores.depths)
  if (deckWidthFt !== null) fieldConfidence['deck.widthFt'] = dimensionScore
  if (response.deck.material !== 'unknown') fieldConfidence['deck.material'] = clampConfidence(scores.materials)
  if (response.enclosure.present) fieldConfidence['enclosure.present'] = clampConfidence(scores.features)
  features.forEach((_feature, index) => {
    fieldConfidence[`features.${index}.label`] = clampConfidence(scores.features)
  })
  for (const key of ['interiorFinish', 'copingMaterial', 'tileBand', 'deckMaterial'] as const) {
    if (response.materials[key] !== null) {
      fieldConfidence[`materials.${key}`] = clampConfidence(scores.materials)
    }
  }

  return {
    contribution: {
      sourceImageId: image.sourceImageId,
      kind: 'SKETCH',
      extractorVersion: SKETCH_EXTRACTOR_VERSION,
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
