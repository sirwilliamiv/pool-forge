// The arithmetic a payment schedule and an expiry date depend on.
//
// Pure functions, no database. The two things worth pinning here are the ones a
// customer would find with a calculator and a calendar: a draw schedule whose
// column does not add up to the total in bold, and a proposal whose terms
// refer to an expiration date the document never prints.

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PROPOSAL_TERMS,
  DEFAULT_PROPOSAL_VALID_DAYS,
  SUGGESTED_PAYMENT_SCHEDULE,
  allocateSchedule,
  parsePaymentSchedule,
  proposalExpiry,
  scheduleBalances,
  scheduleTotalPercent,
  normalizeBrandColor,
  normalizeLogoUrl,
} from '@/modules/organization/company'

describe('parsePaymentSchedule', () => {
  it('reads a stored schedule back', () => {
    const stored = [{ label: 'Deposit', percent: 10, dueOn: 'On signing' }]
    expect(parsePaymentSchedule(stored)).toEqual(stored)
  })

  it('survives the shapes Prisma Json can actually hold', () => {
    // The column is untyped Json. A row written by hand, by an older shape, or
    // by a half-finished migration must not throw in the middle of rendering a
    // customer's proposal.
    expect(parsePaymentSchedule(null)).toEqual([])
    expect(parsePaymentSchedule({})).toEqual([])
    expect(parsePaymentSchedule('deposit 10%')).toEqual([])
    expect(parsePaymentSchedule([{ label: '', percent: 10 }])).toEqual([])
    expect(parsePaymentSchedule([{ label: 'Deposit', percent: 'ten' }])).toEqual([])
    expect(parsePaymentSchedule([{ label: 'Deposit', percent: 140 }])).toEqual([])
  })

  it('keeps the good stages out of a partly broken row', () => {
    const parsed = parsePaymentSchedule([
      { label: 'Deposit', percent: 10 },
      'nonsense',
      { label: 'Final', percent: 90 },
    ])
    expect(parsed.map((stage) => stage.label)).toEqual(['Deposit', 'Final'])
  })

  it('refuses to grow without limit', () => {
    const huge = Array.from({ length: 40 }, (_, i) => ({ label: `S${i}`, percent: 1 }))
    expect(parsePaymentSchedule(huge)).toHaveLength(12)
  })
})

describe('scheduleBalances', () => {
  it('accepts an empty schedule, which prints nothing', () => {
    expect(scheduleBalances([])).toBe(true)
  })

  it('accepts the suggested schedule', () => {
    expect(scheduleTotalPercent(SUGGESTED_PAYMENT_SCHEDULE)).toBe(100)
    expect(scheduleBalances(SUGGESTED_PAYMENT_SCHEDULE)).toBe(true)
  })

  it('rejects a schedule that does not cover the contract', () => {
    expect(scheduleBalances([{ label: 'Deposit', percent: 10 }])).toBe(false)
    expect(
      scheduleBalances([
        { label: 'Deposit', percent: 50 },
        { label: 'Final', percent: 60 },
      ]),
    ).toBe(false)
  })
})

describe('allocateSchedule', () => {
  it('prints dollars, not just percentages', () => {
    const rows = allocateSchedule([{ label: 'Deposit', percent: 10 }], 45514)
    expect(rows[0]?.amount).toBe(4551)
  })

  it('makes the column add up to the printed total', () => {
    // 10/30/30/20/10 of $45,514 rounds to five figures that sum to $45,513. A
    // customer adding the column and coming up a dollar short has found a
    // mistake in the contract, so the last draw absorbs the rounding.
    const total = 45514
    const rows = allocateSchedule(SUGGESTED_PAYMENT_SCHEDULE, total)
    expect(rows.map((row) => row.amount)).toEqual([4551, 13654, 13654, 9103, 4552])
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(total)
  })

  it('makes the suggested schedule add up on a range of totals', () => {
    for (const total of [1, 999, 45514, 110639, 250001, 1234567]) {
      const rows = allocateSchedule(SUGGESTED_PAYMENT_SCHEDULE, total)
      expect(rows.reduce((sum, row) => sum + row.amount, 0), `total ${total}`).toBe(total)
    }
  })

  it('leaves a schedule that does not balance alone', () => {
    // Stretching the last draw to cover a settings mistake would hide the
    // mistake behind a column that looks right.
    const rows = allocateSchedule([{ label: 'Deposit', percent: 10 }], 100000)
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(10000)
  })

  it('carries the due wording through, and nulls a missing one', () => {
    const rows = allocateSchedule(
      [
        { label: 'Deposit', percent: 50, dueOn: 'On signing' },
        { label: 'Final', percent: 50 },
      ],
      1000,
    )
    expect(rows[0]?.dueOn).toBe('On signing')
    expect(rows[1]?.dueOn).toBeNull()
  })

  it('does not blow up on a quote with no total', () => {
    const rows = allocateSchedule(SUGGESTED_PAYMENT_SCHEDULE, Number.NaN)
    expect(rows.every((row) => Number.isFinite(row.amount))).toBe(true)
  })
})

describe('proposalExpiry', () => {
  const issuedAt = new Date('2026-08-22T12:00:00Z')

  it('uses the date a person set by hand', () => {
    const explicit = new Date('2026-12-25T00:00:00Z')
    expect(proposalExpiry({ explicit, issuedAt, validDays: 30 })).toEqual(explicit)
  })

  it('counts the organisation window forward from issue when nobody set one', () => {
    const expiry = proposalExpiry({ explicit: null, issuedAt, validDays: 30 })
    expect(expiry.toISOString().slice(0, 10)).toBe('2026-09-21')
  })

  it('falls back to the default window on a nonsense value', () => {
    const expiry = proposalExpiry({ explicit: null, issuedAt, validDays: 0 })
    const expected = new Date(issuedAt)
    expected.setDate(expected.getDate() + DEFAULT_PROPOSAL_VALID_DAYS)
    expect(expiry.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10))
  })

  it('always produces a date, which is what the terms paragraph promises', () => {
    // The whole point: "Pricing valid until the proposal expiration date listed
    // above" was printed on a document that listed no date at all.
    expect(DEFAULT_PROPOSAL_TERMS).toContain('expiration date')
    expect(proposalExpiry({ explicit: null, issuedAt, validDays: 30 })).toBeInstanceOf(Date)
  })
})

describe('normalizing what a builder types', () => {
  it('keeps a hex colour and drops anything else', () => {
    expect(normalizeBrandColor('#0284c7')).toBe('#0284c7')
    expect(normalizeBrandColor('  #fff  ')).toBe('#fff')
    expect(normalizeBrandColor('')).toBeNull()
    expect(normalizeBrandColor('cornflower blue')).toBeNull()
  })

  it('keeps a real logo link and drops a javascript: URL', () => {
    expect(normalizeLogoUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    )
    expect(normalizeLogoUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(normalizeLogoUrl('')).toBeNull()
    expect(normalizeLogoUrl('javascript:alert(1)')).toBeNull()
  })
})
