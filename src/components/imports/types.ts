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
 */
export type StageState = 'PENDING' | 'RUNNING' | 'OK' | 'FAILED'

export interface StageView {
  status: StageState
  /** `err_<12 hex>` correlation ref. Never raw third-party error text. */
  errorRef: string | null
}

export interface SourceImageView {
  id: string
  /** Readable, stable, and never the cuid: "Sketch 1", "Site plan 2". */
  label: string
  kindLabel: string
  widthPx: number
  heightPx: number
  stages: Record<AnalysisStageName, StageView>
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

export function emptyStages(): Record<AnalysisStageName, StageView> {
  return {
    CLASSIFY: { status: 'PENDING', errorRef: null },
    EXTRACT: { status: 'PENDING', errorRef: null },
    CALIBRATE: { status: 'PENDING', errorRef: null },
  }
}
