// CLASSIFY stage. One cheap call that decides which extractor runs.

import { z } from 'zod'
import type { VisionClient } from './client'
import { CLASSIFY_EXTRACTOR_VERSION, CLASSIFY_PROMPT } from './prompts/classify'
import { runStructuredCall } from './runner'
import {
  ImageKindSchema,
  QualityFlagSchema,
  type AnalysisRecord,
  type ClassificationResult,
  type VisionImage,
  type VisionUsage,
} from './types'

/** Rotation is reported in quarter turns; anything else is a misread. */
const ROTATIONS = [0, 90, 180, 270] as const

export const ClassificationResponseSchema = z.object({
  kind: ImageKindSchema,
  rotationDeg: z
    .number()
    .int()
    .transform((value) => ((value % 360) + 360) % 360)
    .refine((value): value is (typeof ROTATIONS)[number] => (ROTATIONS as readonly number[]).includes(value), {
      message: 'rotationDeg must be 0, 90, 180 or 270',
    }),
  qualityFlags: z.array(QualityFlagSchema).max(8),
  confidence: z.number().min(0).max(1),
})
export type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>

export interface ClassifyOptions {
  client: VisionClient
  image: VisionImage
  model: string
}

export interface ClassifyResult extends ClassificationResult {
  extractorVersion: string
  usage: VisionUsage
  analysis: AnalysisRecord
  repaired: boolean
}

export async function classifyImage(options: ClassifyOptions): Promise<ClassifyResult> {
  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: CLASSIFY_PROMPT,
    extractorVersion: CLASSIFY_EXTRACTOR_VERSION,
    schema: ClassificationResponseSchema,
    image: options.image,
    stage: 'CLASSIFY',
    temperature: 0,
  })

  // Duplicate flags are harmless but noisy downstream; collapse them here.
  const qualityFlags = [...new Set(result.data.qualityFlags)]

  return {
    kind: result.data.kind,
    rotationDeg: result.data.rotationDeg,
    qualityFlags,
    confidence: result.data.confidence,
    extractorVersion: CLASSIFY_EXTRACTOR_VERSION,
    usage: result.usage,
    analysis: result.analysis,
    repaired: result.repaired,
  }
}

/** True when nothing in the image establishes real world size. */
export function lacksScaleReference(classification: ClassificationResult): boolean {
  return classification.qualityFlags.includes('no-scale-reference')
}
