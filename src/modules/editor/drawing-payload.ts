// Pure read/write normalisation for `Drawing.rootJson`. Kept out of
// `persistence.ts` because that file is a `'use server'` module, where every
// export must be an async server action, and because both shapes of the survey
// payload need ordinary unit tests.

import type { Shape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'

export interface DrawingPayload {
  shapes: Shape[]
  survey: SurveyConfig | null
}

/**
 * Reads both survey shapes:
 *
 *  - current: `survey.sourceImageId` referencing a `SourceImage` row,
 *  - legacy:  `survey.imageDataUrl` holding the raster inline.
 *
 * A legacy drawing keeps its raster under `legacyImageDataUrl` so it still
 * opens and still renders its underlay before the migration script has run.
 */
export function parseDrawingPayload(raw: unknown): DrawingPayload {
  if (!raw || typeof raw !== 'object') return { shapes: [], survey: null }
  const obj = raw as { shapes?: unknown; survey?: unknown }
  const shapes = Array.isArray(obj.shapes) ? (obj.shapes as Shape[]) : []
  return { shapes, survey: parseSurvey(obj.survey) }
}

export function parseSurvey(raw: unknown): SurveyConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown> & { imageDataUrl?: unknown }

  const sourceImageId = typeof obj.sourceImageId === 'string' ? obj.sourceImageId : ''
  const legacy =
    typeof obj.imageDataUrl === 'string' && obj.imageDataUrl.length > 0
      ? obj.imageDataUrl
      : null

  // Neither reference nor raster: there is no underlay to show.
  if (sourceImageId === '' && legacy === null) return null

  const rest: Record<string, unknown> = { ...obj }
  delete rest.imageDataUrl
  const survey = { ...rest, sourceImageId } as SurveyConfig
  if (legacy !== null) survey.legacyImageDataUrl = legacy
  return survey
}

/**
 * Serialises for storage. `legacyImageDataUrl` is preserved rather than
 * dropped: silently discarding it would destroy the only copy of an
 * un-migrated underlay. `scripts/migrate-survey-images.ts` is what removes it,
 * after the bytes are safe in the BlobStore.
 */
export function serializeDrawingPayload(payload: DrawingPayload): {
  shapes: Shape[]
  survey: Record<string, unknown> | null
} {
  if (!payload.survey) return { shapes: payload.shapes, survey: null }
  const { legacyImageDataUrl, ...rest } = payload.survey
  const survey: Record<string, unknown> = { ...rest }
  if (typeof legacyImageDataUrl === 'string' && legacyImageDataUrl.length > 0) {
    survey.imageDataUrl = legacyImageDataUrl
  }
  return { shapes: payload.shapes, survey }
}
