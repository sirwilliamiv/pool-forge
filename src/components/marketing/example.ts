// The worked example, in one place.
//
// Every marketing surface illustrates the same job: a 32 by 16 pool at an
// average depth of five feet, on a 600 sq ft paver deck. That is deliberate —
// a builder who reads the front door and then a product page should recognise
// the same pool rather than wonder which one is real.
//
// It lives here because it did not stay consistent when it did not. The front
// door taxed at 7% and the product pages at 6.5%, so the same six line items
// footed to two different totals, and one of the two tax figures was simply
// arithmetic done by hand and got wrong. Totals are computed from the lines
// now, in whole cents, so they cannot disagree with each other or with
// themselves.
//
// These are illustration figures. The real lines, units and prices come out of
// the builder's own price book, and every surface that shows them says so.

/** Cents throughout. Money that goes through a float is money that drifts. */
export interface ExampleLine {
  label: string
  /** The measurement this line is priced from, in the unit it is sold in. */
  qty: string
  cents: number
}

export const EXAMPLE_POOL = {
  width: 32,
  length: 16,
  /** Square feet of water surface. */
  surfaceArea: 512,
  /** Linear feet of coping, which is also the pool's perimeter. */
  perimeter: 96,
  gallons: 19_150,
  deckArea: 600,
  shallow: `3'-6"`,
  deep: `8'-0"`,
} as const

export const EXAMPLE_LINES: readonly ExampleLine[] = [
  { label: 'Excavation and haul off', qty: '512 sq ft', cents: 614_400 },
  { label: 'Shotcrete shell', qty: '512 sq ft', cents: 1_024_000 },
  { label: 'Pebble interior finish', qty: '512 sq ft', cents: 870_400 },
  { label: 'Travertine coping', qty: '96 lf', cents: 432_000 },
  { label: 'Paver deck', qty: '600 sq ft', cents: 900_000 },
  { label: 'Heater, 400k BTU', qty: '1 ea', cents: 485_000 },
]

/** Illustration rate. A real organisation's rate is a setting on the org. */
export const EXAMPLE_TAX_RATE = 0.07

export const EXAMPLE_SUBTOTAL_CENTS = EXAMPLE_LINES.reduce((sum, line) => sum + line.cents, 0)

/** Rounded to the cent the way a total on a document is, not left as a float. */
export const EXAMPLE_TAX_CENTS = Math.round(EXAMPLE_SUBTOTAL_CENTS * EXAMPLE_TAX_RATE)

export const EXAMPLE_TOTAL_CENTS = EXAMPLE_SUBTOTAL_CENTS + EXAMPLE_TAX_CENTS

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

export function money(cents: number): string {
  return USD.format(cents / 100)
}

/** `$46,286` — for a list where the cents are noise rather than information. */
export function moneyRounded(cents: number): string {
  return USD.format(Math.round(cents / 100)).replace(/\.00$/, '')
}

export const EXAMPLE_TAX_LABEL = `Sales tax, ${(EXAMPLE_TAX_RATE * 100).toFixed(0)}%`
