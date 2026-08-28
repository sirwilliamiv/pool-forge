// Bounded number fields for command schemas, and the sentences they refuse with.
//
// `src/lib/geometry/limits.ts` says what a pool may be. This says it in Zod, so
// that every route into a dimension — an inspector field, a keyboard shortcut,
// a spoken instruction the voice agent turns into a tool call — meets the same
// bound at the same place: `command.inputSchema`, which `/api/commands` and
// `dispatchCommand` both run before anything executes.
//
// REFUSE, DO NOT CLAMP.
//
// Both were on the table. Clamping is friendlier in the moment: 99999 becomes
// 400 and the drawing keeps moving. It is also how a number nobody chose gets
// onto a quote and then onto a contract, which is precisely the reasoning
// `src/modules/pricing/import-safety.ts` already settled for imported price
// lists. Voice makes it worse rather than better: a clamped call comes back
// "ok", so the agent says "the pool is now ninety nine thousand feet long" and
// is wrong out loud. A refusal is a sentence the user can act on and a value
// they still have in the field to correct.
//
// The drag handles still clamp, and that is not an inconsistency: see the note
// on `clampSizeIn`.
//
// Every builder here supplies its own message. `humanCommandInputError` prints
// a range failure's message verbatim, so a bound added without one reaches a
// person as Zod's "Number must be less than or equal to 400" — which is why
// `bounds.test.ts` asserts every field built here reads as English.

import { z } from 'zod'

import {
  MAX_AREA_SQFT,
  MAX_COORD_FT,
  MAX_COORD_IN,
  MAX_DEPTH_FT,
  MAX_FEATURE_HEIGHT_IN,
  MAX_ROTATION_DEG,
  MAX_SIZE_FT,
  MAX_SIZE_IN,
  MAX_SLOPE,
  MIN_AREA_SQFT,
  MIN_DEPTH_FT,
  MIN_FEATURE_HEIGHT_IN,
  MIN_SIZE_FT,
  MIN_SIZE_IN,
  MIN_SLOPE,
} from '@/lib/geometry/limits'

/** `4800` → `4,800`, so a limit in a sentence reads the way it is spoken. */
function figure(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * A bounded number, with a sentence for each end of the range.
 *
 * `.min` / `.max` rather than a refinement on purpose: they survive
 * `zodToJsonSchema` as `minimum` / `maximum`, which are two of the few keywords
 * the Live API accepts, so the voice model is told the range up front and can
 * ask "did you mean forty feet?" instead of guessing and being refused.
 */
function bounded(
  label: string,
  unit: string,
  min: number,
  max: number,
): z.ZodNumber {
  const range = `${label} must be between ${figure(min)} and ${figure(max)} ${unit}.`
  // The same sentence on all four ways of being wrong: too big, too small, not
  // finite, and not a number at all (which is where `NaN` lands, since it has
  // the number type and fails `z.number()` on value). A caller who typed
  // nonsense and a caller who typed 99999 both need to be told the range.
  return z
    .number({ invalid_type_error: range })
    .finite(range)
    .min(min, range)
    .max(max, range)
}

/**
 * The same range, phrased for somebody typing feet into a field.
 *
 * The inspector works in feet and multiplies by twelve before dispatching, so a
 * refusal from the command quotes a number nobody typed: enter 99999 and be
 * told "you entered 1,199,988". Technically true, useless to read. A caller
 * that converts should check the value in the unit the person actually used and
 * say so, before the command ever sees it.
 */
export function feetOutOfRange(
  label: string,
  valueFt: number,
  minFt: number,
  maxFt: number,
): string | null {
  if (Number.isFinite(valueFt) && valueFt >= minFt && valueFt <= maxFt) return null
  return `${label} must be between ${figure(minFt)} and ${figure(maxFt)} feet. You entered ${figure(valueFt)}.`
}

/** A pool or object extent in inches, which is what `Shape` stores. */
export function sizeInches(label: string): z.ZodNumber {
  return bounded(label, 'inches', MIN_SIZE_IN, MAX_SIZE_IN)
}

/** The same extent in feet, which is what a person types and says. */
export function sizeFeet(label: string): z.ZodNumber {
  return bounded(label, 'feet', MIN_SIZE_FT, MAX_SIZE_FT)
}

/** Distance from the drawing origin, in inches. Negative is left of, or above, it. */
export function coordinateInches(label: string): z.ZodNumber {
  return bounded(label, 'inches', -MAX_COORD_IN, MAX_COORD_IN)
}

/** Distance from the drawing origin, in feet. */
export function coordinateFeet(label: string): z.ZodNumber {
  return bounded(label, 'feet', -MAX_COORD_FT, MAX_COORD_FT)
}

/** Water depth in feet. Its own range: a depth is not a footprint. */
export function depthFeet(label: string): z.ZodNumber {
  return bounded(label, 'feet', MIN_DEPTH_FT, MAX_DEPTH_FT)
}

/** Floor fall, rise over run. */
export function slopeRatio(label: string): z.ZodNumber {
  return bounded(label, 'rise over run', MIN_SLOPE, MAX_SLOPE)
}

/** An angle in degrees. */
export function rotationDegrees(label: string): z.ZodNumber {
  return bounded(label, 'degrees', -MAX_ROTATION_DEG, MAX_ROTATION_DEG)
}

/** A surface area in square feet. */
export function areaSquareFeet(label: string): z.ZodNumber {
  return bounded(label, 'square feet', MIN_AREA_SQFT, MAX_AREA_SQFT)
}

/** A height measured off the pool rather than the ground, in inches. */
export function featureHeightInches(label: string): z.ZodNumber {
  return bounded(label, 'inches', MIN_FEATURE_HEIGHT_IN, MAX_FEATURE_HEIGHT_IN)
}

/**
 * What to say when a shallow end is deeper than the deep end.
 *
 * Not a range failure, so it cannot live on a single field: it is a claim about
 * two of them together. Both the command schema (when the caller sent both
 * depths) and the client handler (when it sent one, and the other is already on
 * the pool) refuse with this exact sentence, so the same mistake reads the same
 * way whichever half of it arrived.
 */
export function depthOrderMessage(shallowFt: number, deepFt: number): string {
  return `The shallow end cannot be deeper than the deep end. You asked for a shallow end of ${figure(
    shallowFt,
  )} ft against a deep end of ${figure(deepFt)} ft.`
}

/**
 * Attach the shallow-before-deep check to a schema that carries both depths.
 *
 * The keys are passed in because the two commands that carry a depth pair spell
 * them differently (`shallowDepthFt` on the geometry command, `shallowDepth` on
 * the depth-profile one), and the issue has to point at the field the caller
 * actually sent for the inspector to highlight anything.
 *
 * Only fires when both arrived together. One depth on its own has to be checked
 * against the depth already on the pool, which is client state and therefore
 * the client handler's job.
 */
export function withOrderedDepths<T extends z.AnyZodObject>(
  schema: T,
  shallowKey: string,
  deepKey: string,
): z.ZodEffects<T> {
  return schema.superRefine((value, ctx) => {
    const record = value as Record<string, unknown>
    const shallowFt = record[shallowKey]
    const deepFt = record[deepKey]
    if (typeof shallowFt !== 'number' || typeof deepFt !== 'number') return
    if (shallowFt <= deepFt) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [shallowKey],
      message: depthOrderMessage(shallowFt, deepFt),
    })
  })
}
