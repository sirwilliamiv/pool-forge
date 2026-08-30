// Pure read/write normalisation for `Drawing.rootJson`. Kept out of
// `persistence.ts` because that file is a `'use server'` module, where every
// export must be an async server action, and because both shapes of the survey
// payload need ordinary unit tests.

import type { Shape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'
import type { SiteGrade } from '@/modules/editor/grade/model'
import { emptyGrade, parseCaptureProvenance } from '@/modules/editor/grade/model'
import { parseComments, type DrawingComment } from '@/modules/editor/comments/model'
import { surveyGeoSchema, type SurveyGeo } from '@/modules/site/geo/types'

export interface DrawingPayload {
  shapes: Shape[]
  survey: SurveyConfig | null
  /**
   * The site's elevations: the ground as measured, and as designed.
   *
   * Optional, and absent on every drawing made before grading existed. Those
   * have to keep opening, so a missing grade means a flat site rather than an
   * error.
   */
  grade?: { existing: SiteGrade; finished: SiteGrade } | null
  /**
   * The builder's notes pinned to the drawing.
   *
   * Working notes, not drawing objects: they are here rather than in `shapes`
   * so nothing that renders a shape can put one in front of a customer.
   * Absent on every drawing made before comments existed, which means none.
   */
  comments?: DrawingComment[]
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
  if (!raw || typeof raw !== 'object') return { shapes: [], survey: null, comments: [] }
  const obj = raw as { shapes?: unknown; survey?: unknown; grade?: unknown; comments?: unknown }
  const shapes = Array.isArray(obj.shapes) ? (obj.shapes as Shape[]) : []
  return {
    shapes,
    survey: parseSurvey(obj.survey),
    grade: parseGrade(obj.grade),
    comments: parseComments(obj.comments),
  }
}

/**
 * Reads the site elevations, tolerating their absence.
 *
 * Returns null rather than a pair of empty grades when there is nothing stored,
 * so a drawing that never had a grade does not start writing one back on its
 * next save.
 */
export function parseGrade(raw: unknown): { existing: SiteGrade; finished: SiteGrade } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { existing?: unknown; finished?: unknown }
  const existing = parseSurface(obj.existing)
  const finished = parseSurface(obj.finished)
  if (!existing && !finished) return null
  return { existing: existing ?? emptyGrade(), finished: finished ?? emptyGrade() }
}

function parseSurface(raw: unknown): SiteGrade | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<SiteGrade>
  const points = Array.isArray(obj.points) ? obj.points : []
  // Provenance survives the round trip. Dropping it would leave the shots on a
  // reopened drawing looking like a builder typed them, and the panel would
  // quietly stop saying which of that ground was walked.
  const capture = parseCaptureProvenance(obj.capture)
  const surface: SiteGrade = {
    baseElevationFt: Number.isFinite(obj.baseElevationFt) ? (obj.baseElevationFt as number) : 0,
    falloff: Number.isFinite(obj.falloff) ? (obj.falloff as number) : 2,
    enabled: obj.enabled === true,
    points: points
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map(point => ({
        id: String(point.id ?? ''),
        x: point.x,
        y: point.y,
        elevationFt: Number.isFinite(point.elevationFt) ? point.elevationFt : 0,
        kind: point.kind === 'finished' || point.kind === 'fixed' ? point.kind : ('existing' as const),
        ...(point.label ? { label: point.label } : {}),
      })),
  }
  if (capture !== null) surface.capture = capture
  return surface
}

export function parseSurvey(raw: unknown): SurveyConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown> & { imageDataUrl?: unknown }

  const sourceImageId = typeof obj.sourceImageId === 'string' ? obj.sourceImageId : ''
  const legacy =
    typeof obj.imageDataUrl === 'string' && obj.imageDataUrl.length > 0
      ? obj.imageDataUrl
      : null

  // Satellite backdrop parameters, validated rather than trusted: `geo` is
  // what the renderer turns into a fetch URL, and a corrupt zoom or size would
  // otherwise ride straight from the database into the proxy route. Invalid
  // geo is dropped, not fatal, so a damaged record degrades to "no backdrop".
  const geoParsed = surveyGeoSchema.safeParse(obj.geo)
  const geo: SurveyGeo | null = geoParsed.success ? geoParsed.data : null

  // No reference, no raster, no geo: there is no underlay to show. A survey
  // with `geo` and no sourceImageId is valid; its image comes from the
  // satellite proxy at view time.
  if (sourceImageId === '' && legacy === null && geo === null) return null

  const rest: Record<string, unknown> = { ...obj }
  delete rest.imageDataUrl
  delete rest.geo
  const survey = { ...rest, sourceImageId } as SurveyConfig
  if (legacy !== null) survey.legacyImageDataUrl = legacy
  if (geo !== null) survey.geo = geo
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
  grade?: { existing: SiteGrade; finished: SiteGrade }
  comments?: DrawingComment[]
} {
  // The grade is attached first and unconditionally. An earlier version
  // returned early when there was no survey underlay, which would have written
  // every graded drawing back without its elevations the moment somebody
  // removed the underlay.
  const out: {
    shapes: Shape[]
    survey: Record<string, unknown> | null
    grade?: { existing: SiteGrade; finished: SiteGrade }
    comments?: DrawingComment[]
  } = { shapes: payload.shapes, survey: null }

  if (payload.grade) out.grade = payload.grade

  // Written whenever the caller has an opinion, including an empty list: a save
  // that dropped the key would make deleting the last note un-saveable, since
  // the reader treats a missing key as "this drawing never had any".
  if (payload.comments) out.comments = payload.comments

  if (payload.survey) {
    const { legacyImageDataUrl, ...rest } = payload.survey
    const survey: Record<string, unknown> = { ...rest }
    if (typeof legacyImageDataUrl === 'string' && legacyImageDataUrl.length > 0) {
      survey.imageDataUrl = legacyImageDataUrl
    }
    // `geo` rides through in `rest` when present. A key explicitly holding
    // `undefined` would round-trip as a `geo: undefined` entry in JSON-land,
    // so it is removed rather than written.
    if (survey.geo === undefined) delete survey.geo
    out.survey = survey
  }

  return out
}
