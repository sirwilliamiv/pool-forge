import { z } from 'zod'

// The business behind the paperwork.
//
// Company settings held a name, a logo, a colour and a tax rate. A proposal is
// the document a customer signs and a builder's business runs on, and none of
// what that document needs had anywhere to live: no address to write to, no
// phone to call, no licence number (Florida requires the CPC number on a pool
// contract), no deposit or draw schedule, and no terms paragraph the builder
// could put their own wording in.
//
// Everything here is read by the proposal and written by one command, so the
// document and the settings page cannot disagree about the shape of it.

/** One stage of the deposit-and-draws schedule. */
export const paymentStageSchema = z.object({
  /** What the customer is paying for, e.g. "Deposit" or "At gunite". */
  label: z.string().trim().min(1).max(80),
  /** Share of the contract total, as a percentage. */
  percent: z.number().finite().min(0).max(100),
  /** When it falls due, in the builder's own words. Optional. */
  dueOn: z.string().trim().max(120).optional(),
})

export type PaymentStage = z.infer<typeof paymentStageSchema>

/** At most twelve: a draw schedule longer than that is a data-entry accident. */
export const paymentScheduleSchema = z.array(paymentStageSchema).max(12)

/**
 * Read a stored schedule, tolerating anything.
 *
 * Prisma keeps this as untyped Json, so a row written by an older shape or by
 * hand has to resolve to something printable rather than throwing halfway
 * through rendering a customer's proposal.
 */
export function parsePaymentSchedule(raw: unknown): PaymentStage[] {
  if (!Array.isArray(raw)) return []
  const out: PaymentStage[] = []
  for (const entry of raw) {
    const parsed = paymentStageSchema.safeParse(entry)
    if (parsed.success) out.push(parsed.data)
    if (out.length === 12) break
  }
  return out
}

/**
 * A schedule to start from, offered on the settings page as one click.
 *
 * Not a default: an organisation that has not set one prints no schedule at
 * all, because a payment schedule nobody chose is worse on a contract than a
 * missing one. This is a suggestion the builder can edit or throw away.
 */
export const SUGGESTED_PAYMENT_SCHEDULE: PaymentStage[] = [
  { label: 'Deposit', percent: 10, dueOn: 'On signing' },
  { label: 'At excavation', percent: 30, dueOn: 'Day of dig' },
  { label: 'At gunite / shell', percent: 30, dueOn: 'On shell completion' },
  { label: 'At tile, coping and deck', percent: 20, dueOn: 'On deck completion' },
  { label: 'Final payment', percent: 10, dueOn: 'On startup, before first fill hand-over' },
]

/** How long a quote stands when nobody sets a date by hand. */
export const DEFAULT_PROPOSAL_VALID_DAYS = 30

/**
 * The terms paragraph a proposal prints when the builder has not written one.
 *
 * Deliberately a paragraph and not a contract. This is a proposal: it says what
 * the price covers and what could move it, and anything more belongs in the
 * builder's own agreement, which is why the field is editable.
 */
export const DEFAULT_PROPOSAL_TERMS = [
  'Pricing is valid until the proposal expiration date shown above.',
  'All work is subject to permit approval and a final site survey.',
  'Final pricing may vary based on actual site conditions discovered during construction.',
  'Excavation surprises, rock removal, and dewatering are billed separately at standard hourly rates.',
  'Customer is responsible for access to the build site and removal of any obstructions prior to the start of work.',
].join(' ')

/** Percentages have to add up before a schedule goes on a document. */
export function scheduleTotalPercent(stages: PaymentStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.percent, 0)
}

/** Within a hundredth of a point of 100%, or empty. */
export function scheduleBalances(stages: PaymentStage[]): boolean {
  if (stages.length === 0) return true
  return Math.abs(scheduleTotalPercent(stages) - 100) < 0.01
}

export interface PaymentStageAmount {
  label: string
  percent: number
  dueOn: string | null
  /** Whole dollars against this quote's total. */
  amount: number
}

/**
 * Percentages against a real total.
 *
 * The reason this is not `total * percent / 100` at the call site: five stages
 * each rounded to the dollar do not add up to the total, and a customer adding
 * the column and finding it two dollars short of the number in bold has found a
 * mistake in the contract. The last stage absorbs the rounding, so the column
 * sums to the printed total exactly.
 */
export function allocateSchedule(stages: PaymentStage[], total: number): PaymentStageAmount[] {
  const safeTotal = Number.isFinite(total) ? total : 0
  const rows: PaymentStageAmount[] = stages.map((stage) => {
    const row: PaymentStageAmount = {
      label: stage.label,
      percent: stage.percent,
      dueOn: stage.dueOn && stage.dueOn.length > 0 ? stage.dueOn : null,
      amount: Math.round((safeTotal * stage.percent) / 100),
    }
    return row
  })

  // Only reconcile a schedule that claims the whole contract. One that does not
  // balance is a settings mistake, and quietly stretching the last draw to
  // cover it would hide the mistake behind a total that looks right.
  const last = rows[rows.length - 1]
  if (last && scheduleBalances(stages)) {
    const summed = rows.reduce((sum, row) => sum + row.amount, 0)
    last.amount += Math.round(safeTotal) - summed
  }
  return rows
}

/**
 * When this proposal stops standing.
 *
 * The terms paragraph has always said "valid until the expiration date listed
 * above" and the document listed no date, so the legal text referred to
 * something that was not there. A hand-set date wins; otherwise the
 * organisation's validity window runs from the day the proposal is issued.
 */
export function proposalExpiry(args: {
  explicit: Date | null
  issuedAt: Date
  validDays: number
}): Date {
  if (args.explicit) return args.explicit
  const days = Number.isFinite(args.validDays) && args.validDays > 0
    ? Math.floor(args.validDays)
    : DEFAULT_PROPOSAL_VALID_DAYS
  const out = new Date(args.issuedAt.getTime())
  out.setDate(out.getDate() + days)
  return out
}

/** Everything a document needs to say who is offering the work. */
export interface CompanyProfile {
  name: string
  logoUrl: string | null
  brandColor: string | null
  address: string | null
  phone: string | null
  email: string | null
  licenseNumber: string | null
}

/** The columns a document reads, so every caller selects the same set. */
export const COMPANY_PROFILE_SELECT = {
  name: true,
  logoUrl: true,
  brandColor: true,
  address: true,
  phone: true,
  email: true,
  licenseNumber: true,
} as const

/** Input accepted by `settings.company.update`, and by the settings form. */
export const companySettingsSchema = z.object({
  name: z.string().trim().min(1, 'A company name is required').max(120),
  logoUrl: z.string().trim().max(2000),
  brandColor: z.string().trim().max(32),
  taxRatePct: z.number().finite().min(0).max(100),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(60),
  email: z.string().trim().max(200),
  licenseNumber: z.string().trim().max(60),
  proposalTerms: z.string().trim().max(8000),
  proposalValidDays: z.number().int().min(1).max(365),
  paymentSchedule: paymentScheduleSchema,
})

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>

/** A hex colour, or nothing. Shared by the form, the command and the document. */
export function normalizeBrandColor(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null
}

/** An https link or an inline image, or nothing. Anything else is not a logo. */
export function normalizeLogoUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  return /^(https?:\/\/|data:image\/)/.test(value) ? value : null
}
