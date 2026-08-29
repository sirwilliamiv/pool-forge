// What the studio asks for after the number lands, and what it will accept.
//
// The order matters and it is the opposite of the usual one. Nothing here is
// asked before the ballpark is on screen: a gate in front of the number would
// cost a third of the visitors and would make the page feel like every other
// "get your free estimate" form, which is precisely the thing homeowners have
// learned to close. By the time this form is on screen the visitor has already
// been given the thing they came for and is choosing to keep it.
//
// So the only required field is an email address, and it is required because
// without one there is nothing to send and nobody to call. Everything else is
// optional and exists because a builder picking up this lead wants to know
// where the yard is before they ring.
//
// Public endpoint, so every field is bounded, same as `waitlist/schema.ts`.

import { z } from 'zod'

/** Field ceilings. Generous for a person, useless as a way to store data here. */
export const DREAM_LEAD_LIMITS = {
  email: 254,
  name: 120,
  postcode: 16,
  /** A share code is eleven characters; the ceiling is slack, not a target. */
  design: 32,
  source: 120,
} as const

/**
 * When they are thinking of building.
 *
 * A closed list rather than free text, because this is the field that decides
 * whether a builder rings today or in the spring, and a sentence cannot be
 * sorted on.
 */
export const TIMEFRAME_OPTIONS = [
  { value: 'ready', label: 'As soon as I can' },
  { value: 'this-year', label: 'This year' },
  { value: 'next-year', label: 'Next year' },
  { value: 'dreaming', label: 'Just dreaming for now' },
] as const

const TIMEFRAME_VALUES = TIMEFRAME_OPTIONS.map((o) => o.value)

/** Empty and absent mean the same thing, and both become NULL. */
function optionalText(max: number): z.ZodType<string | undefined> {
  return z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional()
}

/**
 * A closed list, plus the empty answer.
 *
 * Unrecognised values are dropped rather than rejected, matching the waitlist:
 * the value came from a `<select>` this app rendered, so a mismatch is a stale
 * cached page or somebody hand-posting, and neither is worth losing a real lead
 * over.
 */
const optionalTimeframe: z.ZodType<string | undefined> = z
  .string()
  .trim()
  .max(64)
  .transform((v) => (TIMEFRAME_VALUES.includes(v as (typeof TIMEFRAME_VALUES)[number]) ? v : undefined))
  .optional()

export const dreamLeadSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(DREAM_LEAD_LIMITS.email).email(),
  name: optionalText(DREAM_LEAD_LIMITS.name),
  /**
   * Where the yard is, roughly.
   *
   * A postcode and not an address, deliberately. A full address is more than is
   * needed to route a lead to a builder who covers the area, and asking for one
   * on a public page before anybody has agreed to anything is the request that
   * makes people close the tab.
   */
  postcode: optionalText(DREAM_LEAD_LIMITS.postcode),
  timeframe: optionalTimeframe,
  /** The share code of the design they were looking at. */
  design: z.string().trim().min(1).max(DREAM_LEAD_LIMITS.design),
  /**
   * The ballpark they were shown, so a builder can see what number this person
   * already has in their head before the first phone call.
   */
  ballparkLow: z.number().int().min(0).max(10_000_000),
  ballparkHigh: z.number().int().min(0).max(10_000_000),
  source: optionalText(DREAM_LEAD_LIMITS.source),
})

export type DreamLeadInput = z.infer<typeof dreamLeadSchema>
