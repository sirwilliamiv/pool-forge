// The two hard gates from the ingestion spec, evaluated client-side so the
// user is told what is blocking an apply before they press the button.
//
// The server is still the enforcer: `import.intent.apply` runs the same checks
// and refuses regardless of what this file says. This exists so nobody reaches
// a rejection they could not have predicted, not to replace the guard.

import {
  CONFIDENCE_REVIEW_REQUIRED,
  fieldsRequiringReview,
  hasResolvedScale,
  type DesignIntent,
} from '@/modules/imports/intent'

/**
 * Mirrors `unreviewedFieldPaths()` in `src/modules/commands/categories/import.ts`.
 *
 * Deliberately re-derived rather than imported: that module calls `register()`
 * at load and lazily imports Prisma, neither of which belongs in a client
 * bundle. `src/test/unit/imports/review-gates.test.ts` asserts the two stay in
 * agreement, so drift fails a test rather than shipping.
 */
export function unreviewedFieldPaths(intent: DesignIntent, touched: string[]): string[] {
  const seen = new Set(touched)
  return fieldsRequiringReview(intent).filter((path) => !seen.has(path))
}

export type ApplyBlockReason = 'scale' | 'review' | 'empty' | 'applied'

export interface ApplyGateResult {
  canApply: boolean
  reasons: ApplyBlockReason[]
  /** Dotted paths still below the review threshold and still untouched. */
  unreviewed: string[]
  scaleResolved: boolean
}

export interface ApplyGateInput {
  intent: DesignIntent
  touched: string[]
  /** True when there is nothing in the intent worth writing into the project. */
  hasContent: boolean
  alreadyApplied: boolean
}

export function evaluateApplyGates(input: ApplyGateInput): ApplyGateResult {
  const scaleResolved = hasResolvedScale(input.intent)
  const unreviewed = unreviewedFieldPaths(input.intent, input.touched)
  const reasons: ApplyBlockReason[] = []

  if (input.alreadyApplied) reasons.push('applied')
  if (!input.hasContent) reasons.push('empty')
  if (!scaleResolved) reasons.push('scale')
  if (unreviewed.length > 0) reasons.push('review')

  return {
    canApply: reasons.length === 0,
    reasons,
    unreviewed,
    scaleResolved,
  }
}

/** Confidence for a dotted path, or null when the extractor never scored it. */
export function confidenceFor(intent: DesignIntent, path: string): number | null {
  const score = intent.fieldConfidence[path]
  return typeof score === 'number' ? score : null
}

/** True when a path is scored below the review threshold. */
export function needsReview(intent: DesignIntent, path: string): boolean {
  const score = confidenceFor(intent, path)
  return score !== null && score < CONFIDENCE_REVIEW_REQUIRED
}
