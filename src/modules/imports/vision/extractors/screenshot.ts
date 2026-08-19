// SCREENSHOT extractor. A router, not a prompt.
//
// A screenshot is whatever it is a screenshot of. With a scale reference it is
// read as a site plan and keeps its geometry. Without one it is read as an
// inspiration image and contributes intent only, because a satellite capture
// with no bar scale is exactly as measurable as a render: not at all.

import type { VisionClient } from '../client'
import { lacksScaleReference } from '../classify'
import { SCREENSHOT_EXTRACTOR_VERSION, type ScreenshotRoute } from '../prompts/screenshot'
import { CONCEPT_RENDER_PROMPT, CONCEPT_RENDER_EXTRACTOR_VERSION } from '../prompts/conceptRender'
import { SITE_PLAN_PROMPT, SITE_PLAN_EXTRACTOR_VERSION } from '../prompts/sitePlan'
import { runStructuredCall } from '../runner'
import type { AnalysisRecord, ClassificationResult, IntentContribution, VisionImage } from '../types'
import {
  assertNoGeometry,
  buildConceptRenderExtraction,
  ConceptRenderResponseSchema,
} from './conceptRender'
import { buildSitePlanExtraction, SitePlanResponseSchema } from './sitePlan'

export interface ScreenshotExtractOptions {
  client: VisionClient
  image: VisionImage
  model: string
  classification: ClassificationResult
}

export interface ScreenshotExtraction {
  contribution: IntentContribution
  analysis: AnalysisRecord
  repaired: boolean
  route: ScreenshotRoute
}

/** Which extractor a screenshot should be sent to, decided before any call. */
export function routeScreenshot(classification: ClassificationResult): ScreenshotRoute {
  return lacksScaleReference(classification) ? 'conceptRender' : 'sitePlan'
}

export async function extractScreenshot(options: ScreenshotExtractOptions): Promise<ScreenshotExtraction> {
  const route = routeScreenshot(options.classification)

  if (route === 'conceptRender') {
    const result = await runStructuredCall({
      client: options.client,
      model: options.model,
      prompt: CONCEPT_RENDER_PROMPT,
      extractorVersion: `${SCREENSHOT_EXTRACTOR_VERSION}+${CONCEPT_RENDER_EXTRACTOR_VERSION}`,
      schema: ConceptRenderResponseSchema,
      image: options.image,
      stage: 'EXTRACT',
      temperature: 0,
    })
    const built = buildConceptRenderExtraction(result, options.image, 'SCREENSHOT')
    return {
      contribution: {
        ...built.contribution,
        extractorVersion: `${SCREENSHOT_EXTRACTOR_VERSION}+${CONCEPT_RENDER_EXTRACTOR_VERSION}`,
        warnings: [
          ...built.contribution.warnings,
          `Image ${options.image.sourceImageId} is a screenshot with no scale reference, so it was read for design intent only.`,
        ],
      },
      analysis: built.analysis,
      repaired: built.repaired,
      route,
    }
  }

  const result = await runStructuredCall({
    client: options.client,
    model: options.model,
    prompt: SITE_PLAN_PROMPT,
    extractorVersion: `${SCREENSHOT_EXTRACTOR_VERSION}+${SITE_PLAN_EXTRACTOR_VERSION}`,
    schema: SitePlanResponseSchema,
    image: options.image,
    stage: 'EXTRACT',
    temperature: 0,
  })
  const built = buildSitePlanExtraction(result, options.image, 'SCREENSHOT')
  const version = `${SCREENSHOT_EXTRACTOR_VERSION}+${SITE_PLAN_EXTRACTOR_VERSION}`

  const scaleBar = built.contribution.geometry?.source === 'sitePlan' ? built.contribution.geometry.scaleBar : null
  if (scaleBar === null || scaleBar.parsedInches === null) {
    // The classifier said there was a scale reference and the extractor found
    // none. Demote rather than trust: an unscaled capture is an inspiration
    // image, and pretending otherwise is how a wrong number reaches a quote.
    const demoted = assertNoGeometry({
      ...built.contribution,
      extractorVersion: version,
      warnings: [
        ...built.contribution.warnings,
        `Image ${options.image.sourceImageId} was read as a site plan but no usable scale bar was found, so its geometry was discarded and it contributes intent only.`,
      ],
    })
    return { contribution: demoted, analysis: built.analysis, repaired: built.repaired, route: 'conceptRender' }
  }

  return {
    contribution: { ...built.contribution, extractorVersion: version },
    analysis: built.analysis,
    repaired: built.repaired,
    route,
  }
}
