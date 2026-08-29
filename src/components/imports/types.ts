// View models the review wizard renders. The server component builds these
// from Prisma rows so no client component ever touches the database, and so no
// cuid ever reaches user-facing copy: every row carries its own readable label
// alongside the id it dispatches with.

import type { DesignIntent } from '@/modules/imports/intent'

export const ANALYSIS_STAGES = ['CLASSIFY', 'EXTRACT', 'CALIBRATE'] as const
export type AnalysisStageName = (typeof ANALYSIS_STAGES)[number]

/**
 * `RUNNING` is client-only: it marks the stage an in-flight
 * `import.image.analyze` is currently working on. Every other value comes from
 * a persisted `ImageAnalysis` row, so the ledger survives a reload.
 *
 * `BLOCKED` is derived, not stored: an upstream stage finished without
 * producing what the next one needs, so the next one never ran and never will
 * until something changes. It exists because "Not run" was being shown for two
 * completely different situations — "you have not pressed Analyze yet" and
 * "Analyze ran, gave up after Classify, and told you nothing" — and the second
 * is the one a builder needs explained.
 */
export type StageState = 'PENDING' | 'RUNNING' | 'OK' | 'FAILED' | 'BLOCKED'

export interface StageView {
  status: StageState
  /** `err_<12 hex>` correlation ref. Never raw third-party error text. */
  errorRef: string | null
}

/**
 * Why the pipeline stopped early, in the words shown to the builder.
 *
 * `afterStage` is the last stage that actually ran, so the UI can say which
 * stages were skipped rather than leaving them indistinguishable from stages
 * nobody has started yet.
 */
export interface PipelineStop {
  afterStage: AnalysisStageName
  headline: string
  detail: string
}

export interface SourceImageView {
  id: string
  /** Readable, stable, and never the cuid: "Sketch 1", "Site plan 2". */
  label: string
  kindLabel: string
  widthPx: number
  heightPx: number
  stages: Record<AnalysisStageName, StageView>
  /** Null while the pipeline is free to continue. */
  blocked: PipelineStop | null
}

export type ImportSessionStatusName = 'DRAFT' | 'READY' | 'APPLIED' | 'DISCARDED'

export interface ImportSessionView {
  id: string
  status: ImportSessionStatusName
  intent: DesignIntent
  touchedFieldPaths: string[]
  images: SourceImageView[]
  appliedAtLabel: string | null
}

export interface ProjectView {
  id: string
  name: string
}

export const STAGE_LABELS: Record<AnalysisStageName, string> = {
  CLASSIFY: 'Classify',
  EXTRACT: 'Extract',
  CALIBRATE: 'Calibrate',
}

export const STAGE_DESCRIPTIONS: Record<AnalysisStageName, string> = {
  CLASSIFY: 'Decide what kind of image this is',
  EXTRACT: 'Read the shape, the dimensions, and the materials',
  CALIBRATE: 'Resolve how many pixels make an inch',
}

/**
 * Classification is the router: every extractor is chosen by the kind it
 * returned. `UNKNOWN` means it declined to route, so there is no extractor to
 * call and nothing downstream can run. Stated once, here, because both the
 * ledger and the banner have to say the same thing.
 */
export const UNROUTABLE_STOP: PipelineStop = {
  afterStage: 'CLASSIFY',
  headline: 'Extract and Calibrate did not run.',
  detail:
    'Classify could not tell whether this is a dimensioned sketch, a site plan, a concept render, a backyard photo, or a screenshot, and every extractor is chosen by that answer. Nothing was read from the image, so no field below has been filled in or scored. A photo or scan of the drawing itself, cropped to the page and the right way up, is usually enough to route it.',
}

export function emptyStages(): Record<AnalysisStageName, StageView> {
  return {
    CLASSIFY: { status: 'PENDING', errorRef: null },
    EXTRACT: { status: 'PENDING', errorRef: null },
    CALIBRATE: { status: 'PENDING', errorRef: null },
  }
}
