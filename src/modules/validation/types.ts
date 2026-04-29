import type { MeasurementSummary } from '@/modules/measurements/engine'

export type ValidationLevel = 'pass' | 'warn' | 'error'

export type ValidationCategory = 'project' | 'pool' | 'deck' | 'equipment' | 'export'

export interface ValidationItem {
  id: string
  level: ValidationLevel
  category: ValidationCategory
  message: string
  field?: string
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

export interface ValidationContext {
  project: ValidationProject
  measurements: MeasurementSummary
  selections: ValidationSelections
  shapeCount: number
  hasDeck: boolean
}

export interface ValidationRule {
  id: string
  level: Exclude<ValidationLevel, 'pass'>
  category: ValidationCategory
  passMessage: string
  check: (ctx: ValidationContext) => ValidationItem | null
}

export interface ValidationReport {
  items: ValidationItem[]
  counts: { pass: number; warn: number; error: number }
}
