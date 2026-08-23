import { z } from 'zod'
import type { FinishSelection, PricingSelections } from '@/modules/pricing/engine'
import type { ValidationSelections } from '@/modules/validation/types'

// Legacy rows wrote these as strings/numbers before the form was typed, so a
// boolean field accepts the same values the old hand-rolled `asBool` did.
const looseBool = z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean()).catch(false)

/**
 * Canonical pool-selection shape persisted on `Project.poolFields` (Json).
 *
 * There is ONE schema and ONE writer (the project form's save action). The
 * pricing engine, validation rules, and every export read from this shape.
 *
 * Each thing the builder is sold is ONE question. The answer that moves money
 * is the boolean (or the count); the string beside it is the model/spec that
 * goes on the packet, and it belongs to that answer rather than competing with
 * it. The form renders them that way (the spec box lives under its checkbox and
 * is disabled until the checkbox is on), and `readPoolFields` below makes
 * legacy rows agree with the same rule.
 *
 * Depth is deliberately absent. The pool's shallow and deep ends are geometry:
 * they live on the pool shape in the drawing, drive gallons and wetted area
 * through the measurement engine, and are what the inspector, the proposal and
 * the checklist all read. This schema used to carry a second, free-text copy
 * that drove nothing, so one pool could report three different depths at once.
 *
 * Every field uses `.catch(default)` so a legacy/partial row parses into a
 * fully-populated object instead of throwing (Prisma stores this as untyped
 * Json, so readers must treat it as untrusted input).
 */
export const poolFieldsSchema = z.object({
  // Described once, nothing else asks: these print on the spec sheet.
  poolType: z.string().catch(''),
  interiorFinish: z.string().catch(''),
  equipmentPackage: z.string().catch(''),
  deckMaterial: z.string().catch(''),
  copingMaterial: z.string().catch(''),

  // Sanitization is one question with one answer. The string is what prints;
  // `saltSystemSelected` is what prices, and the two are kept in step below.
  sanitizationPackage: z.string().catch(''),
  saltSystemSelected: looseBool,

  // Heater / screen / lighting: the selection prices, the string beside it is
  // the model or spec printed under that line.
  heaterSelected: looseBool,
  heaterSelection: z.string().catch(''),
  screenSelected: looseBool,
  screenOption: z.string().catch(''),
  lightingQuantity: z.coerce.number().int().min(0).catch(0),
  lightingSelection: z.string().catch(''),
})

export type PoolFields = z.infer<typeof poolFieldsSchema>

/** Keys of the selections that drive pricing/validation/proposal. */
export const POOL_SELECTION_KEYS = [
  'heaterSelected',
  'saltSystemSelected',
  'screenSelected',
  'lightingQuantity',
] as const

/** What a salt row prints when the builder only ticked the box. */
export const SALT_SYSTEM_LABEL = 'Salt system'

/** Whether a written sanitization answer names a salt system. */
function readsAsSalt(text: string): boolean {
  return /\bsalt\b/i.test(text)
}

/**
 * Make a row say one thing.
 *
 * Both halves of a question were separately editable for a long time, so stored
 * rows disagree with themselves in two directions and both directions cost
 * money:
 *
 * - A model number typed with the box left unticked ("Pentair MasterTemp 400",
 *   heater off) shipped a quote with no heater on it. The written answer wins:
 *   a builder who named the heater is building a pool with a heater.
 * - A box ticked with nothing written (salt on, sanitization blank) printed a
 *   blank `Sanitization` row on the customer proposal. The selection wins: it
 *   supplies the words the document needs.
 *
 * Lighting is left alone in the first direction: a fixture name does not imply
 * how many of them there are, so the count stays the builder's to give.
 */
function agree(pf: PoolFields): PoolFields {
  const heaterSelected = pf.heaterSelected || pf.heaterSelection.trim() !== ''
  const screenSelected = pf.screenSelected || pf.screenOption.trim() !== ''
  const saltSystemSelected = pf.saltSystemSelected || readsAsSalt(pf.sanitizationPackage)
  const sanitizationPackage =
    saltSystemSelected && pf.sanitizationPackage.trim() === ''
      ? SALT_SYSTEM_LABEL
      : pf.sanitizationPackage

  return {
    ...pf,
    heaterSelected,
    screenSelected,
    saltSystemSelected,
    sanitizationPackage,
    // A spec with nothing selected to spec is noise on the packet.
    lightingSelection: pf.lightingQuantity > 0 ? pf.lightingSelection : '',
  }
}

/**
 * Parse untrusted JSON (legacy rows, partial data) into a full `PoolFields`
 * with defaults applied. Never throws on field-level problems.
 */
export function readPoolFields(json: unknown): PoolFields {
  const source = json && typeof json === 'object' && !Array.isArray(json) ? json : {}
  return agree(poolFieldsSchema.parse(source))
}

/**
 * The finishes on the drawing win over the words on the form.
 *
 * Interior finish and coping are chosen twice in this product: as free text on
 * the project form, and as a material on the pool itself. The drawing is the
 * thing the customer is buying — the same rule the light count already follows
 * — so it supplies the answer, and the form's text is the fallback for a
 * project with nothing drawn yet.
 *
 * This is also how the finish reaches paper. The proposal and the construction
 * packet both read `interiorFinish` and `copingMaterial` off `poolFields` and
 * printed blank rows for them, because nothing ever wrote the picked material
 * anywhere the exports could see.
 */
export function poolFieldsWithFinishes(
  json: unknown,
  finishes: readonly FinishSelection[],
): PoolFields {
  const pf = readPoolFields(json)
  const interior = finishes.find((finish) => finish.slot === 'interior')
  const coping = finishes.find((finish) => finish.slot === 'coping')
  return {
    ...pf,
    interiorFinish: interior?.materialName ?? pf.interiorFinish,
    copingMaterial: coping?.materialName ?? pf.copingMaterial,
  }
}

/**
 * The pricing engine's view of `Project.poolFields`. Every surface that builds
 * a quote (editor, proposal, construction packet, screen RFQ, share link, the
 * write-through cache) goes through this so the key names can never drift
 * apart again.
 */
export function pricingSelectionsFrom(json: unknown): PricingSelections {
  const pf = readPoolFields(json)
  return {
    heaterSelected: pf.heaterSelected,
    saltSystemSelected: pf.saltSystemSelected,
    screenSelected: pf.screenSelected,
    lightingQuantity: pf.lightingQuantity,
  }
}

/** The validation engine's view — same source, its own `saltSelected` name. */
export function validationSelectionsFrom(json: unknown): ValidationSelections {
  const pf = readPoolFields(json)
  return {
    heaterSelected: pf.heaterSelected,
    saltSelected: pf.saltSystemSelected,
    screenSelected: pf.screenSelected,
    lightingQuantity: pf.lightingQuantity,
  }
}
