// Zod boundary for the public intake form.
//
// Everything here arrives from an unauthenticated stranger. The parse is
// deliberately forgiving on shape and strict on size: a homeowner filling this
// in on a phone should never be bounced for a stray space or a phone number
// written the way they write phone numbers, but no field may become an
// unbounded write into the database.

import { z } from 'zod'

import {
  INTAKE_MAX_EMAIL_CHARS,
  INTAKE_MAX_LABEL_CHARS,
  INTAKE_MAX_NAME_CHARS,
  INTAKE_MAX_NOTES_CHARS,
  INTAKE_MAX_PHONE_CHARS,
} from './constants'

/** Trim, collapse blank to null, then truncate. Never throws on length. */
function optionalText(maxChars: number) {
  return z.unknown().transform((value): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    return trimmed.slice(0, maxChars)
  })
}

export const IntakeContactSchema = z.object({
  customerName: optionalText(INTAKE_MAX_NAME_CHARS),
  email: optionalText(INTAKE_MAX_EMAIL_CHARS),
  phone: optionalText(INTAKE_MAX_PHONE_CHARS),
  notes: optionalText(INTAKE_MAX_NOTES_CHARS),
})

export type IntakeContact = z.infer<typeof IntakeContactSchema>

/**
 * A syntactically implausible email is stored as null rather than rejected: the
 * submission and its photos are the valuable part, and bouncing a homeowner off
 * the form over a typo loses the lead. The builder sees the phone and the notes.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function sanitizeContact(input: IntakeContact): IntakeContact {
  return {
    customerName: input.customerName,
    email: input.email !== null && EMAIL_PATTERN.test(input.email) ? input.email : null,
    phone: input.phone,
    notes: input.notes,
  }
}

/** Response body for a successful submission. No server detail, no ids a stranger could walk. */
export const IntakeAcknowledgementSchema = z.object({
  ok: z.literal(true),
  received: z.number().int().nonnegative(),
  message: z.string(),
})

export type IntakeAcknowledgement = z.infer<typeof IntakeAcknowledgementSchema>

/** Command inputs for builder-side link management. */
export const IntakeLinkCreateSchema = z.object({
  label: z.string().trim().min(1, 'Give the link a label').max(INTAKE_MAX_LABEL_CHARS),
  expiresAt: z.string().datetime().nullish(),
})

export const IntakeLinkUpdateSchema = z.object({
  linkId: z.string().min(1),
  label: z.string().trim().min(1).max(INTAKE_MAX_LABEL_CHARS).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullish(),
})

export const IntakeLinkOutputSchema = z.object({
  linkId: z.string(),
  token: z.string(),
  label: z.string(),
  active: z.boolean(),
  expiresAt: z.string().nullable(),
  submissionCount: z.number().int().nonnegative(),
})

export type IntakeLinkOutput = z.infer<typeof IntakeLinkOutputSchema>
