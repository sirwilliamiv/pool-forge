// What the front door asks a stranger, and what it will accept as an answer.
//
// The two questions that are not contact details are `teamSize` and
// `usesToday`, and they are here because they are what decides who gets a call
// this month: how many people would be quoting with it, and what they are
// quoting with today. Both are closed lists rather than free text so two
// signups can be compared without reading prose, and `note` exists for the
// sentence a closed list cannot hold.
//
// This is a public endpoint's input schema, so every field is bounded. An
// unbounded text column reachable without authentication is a way to fill the
// database from outside.

import { z } from 'zod'

export interface ChoiceOption {
  readonly value: string
  readonly label: string
}

/** Roughly how many people would use it. Ordered small to large; the admin screen sorts on this order. */
export const TEAM_SIZE_OPTIONS: readonly ChoiceOption[] = [
  { value: 'just-me', label: 'Just me' },
  { value: '2-5', label: '2 to 5 people' },
  { value: '6-15', label: '6 to 15 people' },
  { value: '16-plus', label: 'More than 15 people' },
]

/** What they estimate with today. The honest competitive research. */
export const USES_TODAY_OPTIONS: readonly ChoiceOption[] = [
  { value: 'spreadsheet', label: 'Excel or Google Sheets' },
  { value: 'paper', label: 'Paper, or it is in my head' },
  { value: 'structure-studios', label: 'Pool Studio, Vip3D or VizTerra' },
  { value: 'other-software', label: 'Another estimating or CRM package' },
  { value: 'nothing', label: 'Nothing consistent yet' },
  { value: 'other', label: 'Something else' },
]

const TEAM_SIZE_VALUES = TEAM_SIZE_OPTIONS.map((o) => o.value)
const USES_TODAY_VALUES = USES_TODAY_OPTIONS.map((o) => o.value)

/** Field ceilings. Generous for a person, useless as a way to store data here. */
export const WAITLIST_LIMITS = {
  email: 254,
  name: 120,
  company: 160,
  phone: 40,
  note: 2000,
  source: 120,
} as const

/**
 * An empty string and an absent field mean the same thing, so both become
 * `undefined` and the column stays NULL. A row of empty strings would look
 * answered on the admin screen and would break `COALESCE` on a later, fuller
 * submission from the same person.
 */
function optionalText(max: number): z.ZodType<string | undefined> {
  return z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional()
}

/**
 * A closed list, plus the empty answer. Unrecognised values are dropped rather
 * than rejected: the value comes from a `<select>` this app rendered, so a
 * mismatch is either an old cached page or somebody hand-posting, and neither
 * is worth refusing a real signup over. What must not happen is a stranger
 * writing arbitrary text into a column the admin screen renders.
 */
function optionalChoice(values: readonly string[]): z.ZodType<string | undefined> {
  return z
    .string()
    .trim()
    .max(64)
    .transform((v) => (values.includes(v) ? v : undefined))
    .optional()
}

export const waitlistSignupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(WAITLIST_LIMITS.email)
    .email(),
  name: optionalText(WAITLIST_LIMITS.name),
  company: optionalText(WAITLIST_LIMITS.company),
  phone: optionalText(WAITLIST_LIMITS.phone),
  teamSize: optionalChoice(TEAM_SIZE_VALUES),
  usesToday: optionalChoice(USES_TODAY_VALUES),
  note: optionalText(WAITLIST_LIMITS.note),
  source: optionalText(WAITLIST_LIMITS.source),
})

export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>

/** Label for a stored value, for the admin screen. Unknown values print as themselves. */
export function labelFor(options: readonly ChoiceOption[], value: string | null): string {
  if (value === null || value.length === 0) return ''
  return options.find((o) => o.value === value)?.label ?? value
}

/** Position in the option list, for sorting. Unknown and empty sort last. */
export function rankOf(options: readonly ChoiceOption[], value: string | null): number {
  if (value === null) return options.length
  const index = options.findIndex((o) => o.value === value)
  return index === -1 ? options.length : index
}
