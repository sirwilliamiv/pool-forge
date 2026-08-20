// Prisma rows to the view models the review wizard renders. Pure, so the route
// stays a thin query and the labelling rules are unit testable.
//
// Two things this file exists to guarantee: no cuid ever becomes user-facing
// copy, and the stage ledger is built from the newest `ImageAnalysis` row per
// stage rather than from whichever row the database happened to return first.

import {
  ANALYSIS_STAGES,
  emptyStages,
  type AnalysisStageName,
  type SourceImageView,
  type StageState,
  type StageView,
} from './types'

export const SOURCE_IMAGE_KIND_LABELS: Record<string, string> = {
  SKETCH: 'Sketch',
  SITE_PLAN: 'Site plan',
  CONCEPT_RENDER: 'Concept render',
  SITE_PHOTO: 'Site photo',
  SCREENSHOT: 'Screenshot',
  UNKNOWN: 'Image',
}

export interface SourceImageRow {
  id: string
  kind: string
  widthPx: number
  heightPx: number
}

export interface ImageAnalysisRow {
  sourceImageId: string
  stage: string
  status: string
  errorRef: string | null
  createdAt: Date
}

function isTrackedStage(stage: string): stage is AnalysisStageName {
  return (ANALYSIS_STAGES as readonly string[]).includes(stage)
}

function toStageState(status: string): StageState {
  if (status === 'OK') return 'OK'
  if (status === 'FAILED') return 'FAILED'
  return 'PENDING'
}

/**
 * Labels are per kind and one-based, so a session with two sketches and a plat
 * reads "Sketch 1", "Sketch 2", "Site plan 1" rather than exposing ids.
 * `sourceImageIds` fixes the order: it is the order the session recorded.
 */
export function buildSourceImageViews(
  orderedIds: string[],
  rows: SourceImageRow[],
  analyses: ImageAnalysisRow[],
  /**
   * The session's resolved scale, or null when it has none.
   *
   * Calibration belongs to the session, not to the image, but the analysis
   * rows are keyed by image. Ingest dedupes identical bytes within an org, so
   * two sessions share one image, and a calibration performed in the first
   * showed as Done in the second: a green check directly above a banner saying
   * the image has no scale. The session is the authority here.
   */
  sessionPixelsPerInch: number | null = null,
): SourceImageView[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered: SourceImageRow[] = []
  for (const id of orderedIds) {
    const row = byId.get(id)
    if (row) ordered.push(row)
  }
  // Anything the session references but did not order still gets shown.
  for (const row of rows) {
    if (!orderedIds.includes(row.id)) ordered.push(row)
  }

  const latest = new Map<string, ImageAnalysisRow>()
  for (const analysis of analyses) {
    if (!isTrackedStage(analysis.stage)) continue
    const key = `${analysis.sourceImageId}:${analysis.stage}`
    const existing = latest.get(key)
    if (!existing || analysis.createdAt.getTime() > existing.createdAt.getTime()) {
      latest.set(key, analysis)
    }
  }

  const seenPerKind = new Map<string, number>()
  return ordered.map((row) => {
    const kindLabel = SOURCE_IMAGE_KIND_LABELS[row.kind] ?? SOURCE_IMAGE_KIND_LABELS.UNKNOWN ?? 'Image'
    const index = (seenPerKind.get(kindLabel) ?? 0) + 1
    seenPerKind.set(kindLabel, index)

    const stages = emptyStages()
    for (const stage of ANALYSIS_STAGES) {
      const analysis = latest.get(`${row.id}:${stage}`)
      if (!analysis) continue
      const view: StageView = {
        status: toStageState(analysis.status),
        errorRef: analysis.errorRef,
      }
      stages[stage] = view
    }

    // Overridden rather than read from the rows: calibration is complete when
    // this session has a scale, whatever some other session did to the image.
    stages.CALIBRATE = {
      status: sessionPixelsPerInch !== null && sessionPixelsPerInch > 0 ? 'OK' : 'PENDING',
      errorRef: null,
    }

    return {
      id: row.id,
      label: `${kindLabel} ${index}`,
      kindLabel,
      widthPx: row.widthPx,
      heightPx: row.heightPx,
      stages,
    }
  })
}

export function formatAppliedAt(appliedAt: Date | null): string | null {
  if (!appliedAt) return null
  return appliedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
