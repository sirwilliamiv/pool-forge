import type { MeasurementSummary } from '@/modules/measurements/engine'

export type ValidationLevel = 'pass' | 'warn' | 'error'

export type ValidationCategory = 'project' | 'pool' | 'deck' | 'equipment' | 'export' | 'grade'

export interface ValidationItem {
  id: string
  level: ValidationLevel
  category: ValidationCategory
  message: string
  field?: string
  // Optional: shape id the issue refers to (for click-to-select in the dock).
  // Not yet emitted by the rule engine; populated by future rules.
  targetId?: string
  // Optional: short hint surfaced in the validation dock and command palette.
  suggestedFix?: string
}

export interface ValidationProject {
  name: string
  customerName?: string | null
  address?: string | null
  poolFields: Record<string, unknown>
  proposalExpiresAt?: string | null
}

export interface ValidationSelections {
  heaterSelected: boolean
  saltSelected: boolean
  screenSelected: boolean
  lightingQuantity: number
}

/**
 * Optional shape ids the rule engine can use to emit `targetId` on issues.
 * Caller (editor page) populates from the loaded drawing. When omitted, rules
 * still run and emit messages — they just won't be jump-to-able from the dock.
 */
export interface ValidationTargets {
  pool?: string
  spa?: string
  spillover?: string
  heater?: string
}

export interface ValidationContext {
  project: ValidationProject
  measurements: MeasurementSummary
  selections: ValidationSelections
  shapeCount: number
  hasDeck: boolean
  targets?: ValidationTargets
}

export interface ValidationRule {
  id: string
  level: Exclude<ValidationLevel, 'pass'>
  category: ValidationCategory
  passMessage: string
  check: (ctx: ValidationContext) => ValidationItem | null
  /**
   * Whether this rule has anything to say about this design.
   *
   * Absent means always. Without it a rule can only pass or fail, so a site
   * nobody graded would report "site slope is within a walkable fall" — true,
   * and noise on every flat project, which is most of them. A checklist that
   * lists things it did not check is a checklist people stop reading.
   */
  appliesTo?: (ctx: ValidationContext) => boolean
}

export interface ValidationReport {
  items: ValidationItem[]
  counts: { pass: number; warn: number; error: number }
}
