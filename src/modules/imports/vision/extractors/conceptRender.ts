// CONCEPT_RENDER extractor. Intent only, and structurally incapable of
// producing a measurement.
//
// Three independent guards, because this is the failure mode that turns a
// pretty demo into a five figure mistake:
//   1. The prompt refuses dimensions and says why.
//   2. The response schema has no dimension field, so Zod strips any the model
//      invents anyway.
//   3. `assertNoGeometry` re-checks the built contribution before it is
//      returned, and the merge layer re-checks it again on the way in.

import { z } from 'zod'
import {
  DeckMaterialSchema,
  EnclosureKindSchema,
  MaterialsIntentSchema,
  ShapeFamilySchema,
} from '@/modules/imports/intent'
import type { VisionClient } from '../client'
import { logVisionWarning } from '../errors'
import { CONCEPT_RENDER_EXTRACTOR_VERSION, CONCEPT_RENDER_PROMPT } from '../prompts/conceptRender'
import { runStructuredCall, type StructuredCallResult } from '../runner'
import type { AnalysisRecord, IntentContribution, PartialDesignIntent, VisionImage } from '../types'
import { clampConfidence, ConfidenceScoreSchema, dedupeFeatures } from './shared'

/**
 * Note what is absent: no polygon, no dimension array, no scale, no depths, no
 * width, no length. Zod strips unknown keys, so a hallucinated `lengthFt` never
 * survives parsing.
 */
export const ConceptRenderResponseSchema = z.object({
  shapeFamily: ShapeFamilySchema,
  features: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        count: z.number().int().positive().max(99),
      }),
    )
    .max(40),
  materials: MaterialsIntentSchema,
  deckMaterialFamily: DeckMaterialSchema,
  enclosure: z.object({
    present: z.boolean(),
    kind: EnclosureKindSchema,
  }),
  styleNotes: z.array(z.string()).max(20),
  waterColor: z.string().nullable(),
  confidence: z.object({
    shapeFamily: ConfidenceScoreSchema,
    features: ConfidenceScoreSchema,
    materials: ConfidenceScoreSchema,
    style: ConfidenceScoreSchema,
  }),
})
export type ConceptRenderResponse = z.infer<typeof ConceptRenderResponseSchema>

export interface ConceptRenderExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
}

export interface ConceptRenderExtraction {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
}

export async function extractConceptRender(
  options: ConceptRenderExtractOptions,
): Promise<ConceptRenderExtraction> {
  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: CONCEPT_RENDER_PROMPT,
    extractorVersion: CONCEPT_RENDER_EXTRACTOR_VERSION,
    schema: ConceptRenderResponseSchema,
    image: options.image,
    stage: 'EXTRACT',
    temperature: 0,
  })
  return buildConceptRenderExtraction(result, options.image, 'CONCEPT_RENDER')
}

export function buildConceptRenderExtraction(
  result: StructuredCallResult<ConceptRenderResponse>,
  image: VisionImage,
  kind: 'CONCEPT_RENDER' | 'SCREENSHOT',
): ConceptRenderExtraction {
  const response = result.data
  const warnings: string[] = [
    `Image ${image.sourceImageId} is an inspiration image, so it contributed style, materials and features only. No size on it is real.`,
  ]

  const features = dedupeFeatures(
    response.features.map((feature) => ({
      label: feature.label,
      count: feature.count,
      lengthFt: null,
      widthFt: null,
    })),
  )

  const notes = [...response.styleNotes]
  if (response.waterColor !== null && response.waterColor.trim() !== '') {
    notes.push(`water color: ${response.waterColor.trim()}`)
  }

  const intent: PartialDesignIntent = {
    pool: { shapeFamily: response.shapeFamily },
    features: features.map((feature) => ({
      stencilId: null,
      label: feature.label,
      lengthFt: null,
      widthFt: null,
      count: feature.count,
    })),
    deck: { material: response.deckMaterialFamily },
    enclosure: { present: response.enclosure.present, kind: response.enclosure.kind },
    materials: response.materials,
    site: { notes },
  }

  const scores = response.confidence
  const fieldConfidence: Record<string, number> = {
    'pool.shapeFamily': clampConfidence(scores.shapeFamily),
  }
  if (response.deckMaterialFamily !== 'unknown') {
    fieldConfidence['deck.material'] = clampConfidence(scores.materials)
  }
  if (response.enclosure.present) fieldConfidence['enclosure.present'] = clampConfidence(scores.features)
  features.forEach((_feature, index) => {
    fieldConfidence[`features.${index}.label`] = clampConfidence(scores.features)
  })
  for (const key of ['interiorFinish', 'copingMaterial', 'tileBand', 'deckMaterial'] as const) {
    if (response.materials[key] !== null) {
      fieldConfidence[`materials.${key}`] = clampConfidence(scores.materials)
    }
  }

  const contribution: IntentContribution = {
    sourceImageId: image.sourceImageId,
    kind,
    extractorVersion: CONCEPT_RENDER_EXTRACTOR_VERSION,
    intent,
    fieldConfidence,
    warnings,
    geometry: null,
    usage: result.usage,
  }

  return { contribution: assertNoGeometry(contribution), analysis: result.analysis, repaired: result.repaired }
}

/** Every dotted path a concept render is forbidden from populating. */
export const FORBIDDEN_CONCEPT_PATHS = [
  'pool.footprint',
  'pool.lengthFt',
  'pool.widthFt',
  'pool.depthShallowFt',
  'pool.depthDeepFt',
  'deck.footprint',
  'deck.widthFt',
  'enclosure.heightFt',
  'enclosure.footprint',
  'site.propertyBoundary',
  'site.houseFootprint',
  'site.setbacksFt',
  'scale.pixelsPerInch',
] as const

/**
 * Strip every measurement from a contribution that has no ground truth scale.
 * Idempotent, and safe to call on an already clean contribution. Anything it
 * has to remove is a bug, so it logs at warn.
 */
export function assertNoGeometry(contribution: IntentContribution): IntentContribution {
  const removed: string[] = []
  const intent: PartialDesignIntent = { ...contribution.intent }

  if (intent.pool !== undefined) {
    const pool: NonNullable<PartialDesignIntent['pool']> = {}
    if (intent.pool.shapeFamily !== undefined) pool.shapeFamily = intent.pool.shapeFamily
    for (const key of ['lengthFt', 'widthFt', 'depthShallowFt', 'depthDeepFt'] as const) {
      if (intent.pool[key] != null) removed.push(`pool.${key}`)
    }
    intent.pool = pool
  }
  if (intent.deck !== undefined) {
    const deck: NonNullable<PartialDesignIntent['deck']> = {}
    if (intent.deck.material !== undefined) deck.material = intent.deck.material
    if (intent.deck.widthFt != null) removed.push('deck.widthFt')
    intent.deck = deck
  }
  if (intent.enclosure !== undefined) {
    const enclosure: NonNullable<PartialDesignIntent['enclosure']> = {}
    if (intent.enclosure.present !== undefined) enclosure.present = intent.enclosure.present
    if (intent.enclosure.kind !== undefined) enclosure.kind = intent.enclosure.kind
    if (intent.enclosure.heightFt != null) removed.push('enclosure.heightFt')
    intent.enclosure = enclosure
  }
  if (intent.site !== undefined) {
    const site: NonNullable<PartialDesignIntent['site']> = {}
    if (intent.site.notes !== undefined) site.notes = intent.site.notes
    if (intent.site.northDeg != null) removed.push('site.northDeg')
    if (intent.site.setbacksFt != null) removed.push('site.setbacksFt')
    intent.site = site
  }
  if (intent.features !== undefined) {
    intent.features = intent.features.map((feature) => {
      if (feature.lengthFt != null || feature.widthFt != null) removed.push('features.lengthFt')
      return { ...feature, lengthFt: null, widthFt: null }
    })
  }

  const forbidden = new Set<string>(FORBIDDEN_CONCEPT_PATHS)
  const fieldConfidence: Record<string, number> = {}
  for (const [path, score] of Object.entries(contribution.fieldConfidence)) {
    if (forbidden.has(path) || /^features\.\d+\.(lengthFt|widthFt)$/.test(path)) {
      removed.push(path)
      continue
    }
    fieldConfidence[path] = score
  }

  if (removed.length > 0) {
    logVisionWarning('concept_render_geometry_stripped', {
      sourceImageId: contribution.sourceImageId,
      extractorVersion: contribution.extractorVersion,
      removedPaths: [...new Set(removed)],
    })
  }

  return {
    ...contribution,
    intent,
    fieldConfidence,
    geometry: null,
  }
}
