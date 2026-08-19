// Kind to extractor dispatch.

import type { VisionClient } from '../client'
import { safeVisionError } from '../errors'
import type { AnalysisRecord, ClassificationResult, IntentContribution, VisionImage } from '../types'
import { extractConceptRender } from './conceptRender'
import { extractScreenshot } from './screenshot'
import { extractSitePhoto } from './sitePhoto'
import { extractSitePlan } from './sitePlan'
import { extractSketch } from './sketch'

export interface ExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
  classification: ClassificationResult
}

export interface ExtractionOutcome {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
}

/**
 * Run the extractor for a classified image. UNKNOWN is not guessed at: an image
 * nobody could classify is surfaced to the builder rather than run through an
 * extractor whose prompt does not describe it.
 */
export async function extractForKind(options: ExtractOptions): Promise<ExtractionOutcome> {
  const { classification } = options
  switch (classification.kind) {
    case 'SKETCH':
      return extractSketch(options)
    case 'SITE_PLAN':
      return extractSitePlan(options)
    case 'CONCEPT_RENDER':
      return extractConceptRender(options)
    case 'SITE_PHOTO':
      return extractSitePhoto(options)
    case 'SCREENSHOT': {
      const result = await extractScreenshot(options)
      return { contribution: result.contribution, analysis: result.analysis, repaired: result.repaired }
    }
    case 'UNKNOWN':
      throw safeVisionError(`image ${options.image.sourceImageId} could not be classified`, 'unsupported', {
        stage: 'EXTRACT',
        model: options.model,
        sourceImageId: options.image.sourceImageId,
      })
  }
}

export {
  extractConceptRender,
  extractScreenshot,
  extractSitePhoto,
  extractSitePlan,
  extractSketch,
}
export { assertNoGeometry, ConceptRenderResponseSchema, FORBIDDEN_CONCEPT_PATHS } from './conceptRender'
export { SketchResponseSchema } from './sketch'
export { SitePlanResponseSchema, northDegreesFrom } from './sitePlan'
export { SitePhotoResponseSchema } from './sitePhoto'
export { routeScreenshot } from './screenshot'
