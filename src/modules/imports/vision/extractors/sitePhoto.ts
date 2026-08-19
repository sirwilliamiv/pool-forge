// SITE_PHOTO extractor. Existing conditions.
//
// Geometry confidence is low by construction: v1 does no perspective
// rectification, so nothing here is measured. What a photo does contribute is
// the estimator's checklist, and that lands in `site.notes`.

import { z } from 'zod'
import type { VisionClient } from '../client'
import { SITE_PHOTO_EXTRACTOR_VERSION, SITE_PHOTO_PROMPT } from '../prompts/sitePhoto'
import { runStructuredCall, type StructuredCallResult } from '../runner'
import type { AnalysisRecord, IntentContribution, PartialDesignIntent, VisionImage } from '../types'
import { assertNoGeometry } from './conceptRender'
import { clampConfidence, ConfidenceScoreSchema, dedupeFeatures } from './shared'

const POOL_CONDITIONS = ['new', 'good', 'dated', 'damaged', 'unknown'] as const
const FENCE_MATERIALS = ['wood', 'vinyl', 'aluminum', 'chain link', 'masonry', 'none', 'unknown'] as const
const SLOPES = ['flat', 'gentle', 'moderate', 'steep', 'unknown'] as const
const GROUND_COVERS = ['grass', 'bare soil', 'mulch', 'gravel', 'concrete', 'paver', 'mixed', 'unknown'] as const
const ACCESS_RATINGS = ['easy', 'tight', 'blocked', 'unknown'] as const

export const SitePhotoResponseSchema = z.object({
  existingPool: z.object({
    present: z.boolean(),
    condition: z.enum(POOL_CONDITIONS),
  }),
  visibleFeatures: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        count: z.number().int().positive().max(99),
      }),
    )
    .max(40),
  houseWall: z.object({
    visible: z.boolean(),
    material: z.string().nullable(),
    hasSlidingDoor: z.boolean(),
    notes: z.string().nullable(),
  }),
  fence: z.object({
    present: z.boolean(),
    material: z.enum(FENCE_MATERIALS),
    gateVisible: z.boolean(),
    notes: z.string().nullable(),
  }),
  slope: z.object({
    observed: z.enum(SLOPES),
    direction: z.string().nullable(),
  }),
  groundCover: z.enum(GROUND_COVERS),
  access: z.object({
    rating: z.enum(ACCESS_RATINGS),
    notes: z.string().nullable(),
  }),
  obstacles: z.array(z.string()).max(20),
  notes: z.array(z.string()).max(30),
  confidence: z.object({
    features: ConfidenceScoreSchema,
    houseWall: ConfidenceScoreSchema,
    fence: ConfidenceScoreSchema,
    slope: ConfidenceScoreSchema,
    access: ConfidenceScoreSchema,
  }),
})
export type SitePhotoResponse = z.infer<typeof SitePhotoResponseSchema>

export interface SitePhotoExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
}

export interface SitePhotoExtraction {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
}

export async function extractSitePhoto(options: SitePhotoExtractOptions): Promise<SitePhotoExtraction> {
  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: SITE_PHOTO_PROMPT,
    extractorVersion: SITE_PHOTO_EXTRACTOR_VERSION,
    schema: SitePhotoResponseSchema,
    image: options.image,
    stage: 'EXTRACT',
    temperature: 0,
  })
  return buildSitePhotoExtraction(result, options.image)
}

export function buildSitePhotoExtraction(
  result: StructuredCallResult<SitePhotoResponse>,
  image: VisionImage,
): SitePhotoExtraction {
  const response = result.data
  const notes: string[] = []

  if (response.existingPool.present) {
    notes.push(`existing pool on site, condition ${response.existingPool.condition}`)
  }
  if (response.houseWall.visible) {
    const material = response.houseWall.material ?? 'unspecified'
    const door = response.houseWall.hasSlidingDoor ? ', sliding door onto the yard' : ''
    notes.push(`house wall: ${material}${door}`)
    if (response.houseWall.notes !== null) notes.push(`house wall: ${response.houseWall.notes}`)
  }
  if (response.fence.present) {
    const gate = response.fence.gateVisible ? ', gate visible' : ', no gate visible'
    notes.push(`fence: ${response.fence.material}${gate}`)
    if (response.fence.notes !== null) notes.push(`fence: ${response.fence.notes}`)
  }
  notes.push(
    response.slope.direction === null
      ? `slope: ${response.slope.observed}`
      : `slope: ${response.slope.observed}, ${response.slope.direction}`,
  )
  notes.push(`ground cover: ${response.groundCover}`)
  notes.push(
    response.access.notes === null
      ? `equipment access: ${response.access.rating}`
      : `equipment access: ${response.access.rating}, ${response.access.notes}`,
  )
  for (const obstacle of response.obstacles) notes.push(`obstacle: ${obstacle}`)
  notes.push(...response.notes)

  const features = dedupeFeatures(
    response.visibleFeatures.map((feature) => ({
      label: feature.label,
      count: feature.count,
      lengthFt: null,
      widthFt: null,
    })),
  )

  const intent: PartialDesignIntent = {
    features: features.map((feature) => ({
      stencilId: null,
      label: feature.label,
      lengthFt: null,
      widthFt: null,
      count: feature.count,
    })),
    site: { notes },
  }

  const scores = response.confidence
  const fieldConfidence: Record<string, number> = {}
  features.forEach((_feature, index) => {
    fieldConfidence[`features.${index}.label`] = clampConfidence(scores.features)
  })

  const contribution: IntentContribution = {
    sourceImageId: image.sourceImageId,
    kind: 'SITE_PHOTO',
    extractorVersion: SITE_PHOTO_EXTRACTOR_VERSION,
    intent,
    fieldConfidence,
    warnings: [
      `Image ${image.sourceImageId} is a site photograph. It records existing conditions only; nothing on it was measured.`,
    ],
    geometry: null,
    usage: result.usage,
  }

  // Same guard as the concept render: an unrectified photograph has no scale.
  return { contribution: assertNoGeometry(contribution), analysis: result.analysis, repaired: result.repaired }
}
