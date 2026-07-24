import { z } from 'zod'

/**
 * Canonical pool-selection shape persisted on `Project.poolFields` (Json).
 *
 * There is ONE schema and ONE writer (the project form's save action). The
 * pricing engine, validation rules, and every export read from this shape.
 *
 * - Descriptive strings drive the spec / construction document display.
 * - The boolean + number selections drive pricing, validation, and the
 *   customer proposal. These are the keys `PricingSelections` reads
 *   (`heaterSelected`, `saltSystemSelected`, `screenSelected`,
 *   `lightingQuantity`) — previously nothing wrote them, so equipment,
 *   lighting, and screen never appeared on a quote or proposal.
 *
 * Every field uses `.catch(default)` so a legacy/partial row parses into a
 * fully-populated object instead of throwing (Prisma stores this as untyped
 * Json, so readers must treat it as untrusted input).
 */
export const poolFieldsSchema = z.object({
  // Descriptive — shown on spec / construction documents.
  poolType: z.string().catch(''),
  depthShallow: z.string().catch(''),
  depthDeep: z.string().catch(''),
  interiorFinish: z.string().catch(''),
  equipmentPackage: z.string().catch(''),
  sanitizationPackage: z.string().catch(''),
  heaterSelection: z.string().catch(''),
  lightingSelection: z.string().catch(''),
  deckMaterial: z.string().catch(''),
  copingMaterial: z.string().catch(''),
  screenOption: z.string().catch(''),

  // Selections that drive pricing, validation, and the proposal.
  heaterSelected: z.boolean().catch(false),
  saltSystemSelected: z.boolean().catch(false),
  screenSelected: z.boolean().catch(false),
  lightingQuantity: z.coerce.number().int().min(0).catch(0),
})

export type PoolFields = z.infer<typeof poolFieldsSchema>

/** Keys of the selections that drive pricing/validation/proposal. */
export const POOL_SELECTION_KEYS = [
  'heaterSelected',
  'saltSystemSelected',
  'screenSelected',
  'lightingQuantity',
] as const

/**
 * Parse untrusted JSON (legacy rows, partial data) into a full `PoolFields`
 * with defaults applied. Never throws on field-level problems.
 */
export function readPoolFields(json: unknown): PoolFields {
  const source = json && typeof json === 'object' && !Array.isArray(json) ? json : {}
  return poolFieldsSchema.parse(source)
}
