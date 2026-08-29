import { describe, expect, it } from 'vitest'

import {
  EXAMPLE_LINES,
  EXAMPLE_SUBTOTAL_CENTS,
  EXAMPLE_TAX_CENTS,
  EXAMPLE_TAX_LABEL,
  EXAMPLE_TAX_RATE,
  EXAMPLE_TOTAL_CENTS,
  money,
  moneyRounded,
} from '@/components/marketing/example'

// The worked example is the one set of figures every public page shows, so it
// has to add up. It did not: the front door taxed the same six lines at 7% and
// the product pages at 6.5%, and the 6.5% figure was arithmetic done by hand
// and got wrong by 42 cents. Nobody would have noticed until a builder did.
//
// These are cheap assertions about something no type checker can see, and the
// reason they exist is that a wrong number on a page about pricing software is
// a worse look than almost any bug behind it.

describe('the worked example adds up', () => {
  it('foots to the sum of its lines', () => {
    const byHand = EXAMPLE_LINES.reduce((sum, line) => sum + line.cents, 0)
    expect(EXAMPLE_SUBTOTAL_CENTS).toBe(byHand)
    expect(EXAMPLE_SUBTOTAL_CENTS).toBe(4_325_800)
  })

  it('taxes the subtotal at the stated rate', () => {
    expect(EXAMPLE_TAX_CENTS).toBe(Math.round(EXAMPLE_SUBTOTAL_CENTS * EXAMPLE_TAX_RATE))
    expect(EXAMPLE_TAX_CENTS).toBe(302_806)
  })

  it('totals to subtotal plus tax, and nothing else', () => {
    expect(EXAMPLE_TOTAL_CENTS).toBe(EXAMPLE_SUBTOTAL_CENTS + EXAMPLE_TAX_CENTS)
    expect(money(EXAMPLE_TOTAL_CENTS)).toBe('$46,286.06')
  })

  it('labels the rate it actually applied', () => {
    expect(EXAMPLE_TAX_LABEL).toBe('Sales tax, 7%')
  })

  it('keeps every line in whole cents', () => {
    // A line stored as dollars-times-a-float is where the half-cent comes from.
    for (const line of EXAMPLE_LINES) {
      expect(Number.isInteger(line.cents), line.label).toBe(true)
    }
  })
})

describe('formatting', () => {
  it('writes money to the cent', () => {
    expect(money(614_400)).toBe('$6,144.00')
    expect(money(0)).toBe('$0.00')
  })

  it('drops the cents where they would be noise', () => {
    // A job list shows what a job is worth, not what it is worth to the penny.
    expect(moneyRounded(EXAMPLE_TOTAL_CENTS)).toBe('$46,286')
  })
})
