// One money format, everywhere a person reads a figure.
//
// The editor printed $41,546, the proposal printed $41,546 and the construction
// packet printed $41,545.64 for the same job. They were the same number, but a
// customer holding two sheets sees two prices, so the packet now rounds like
// everything else and cents live only where somebody is reconciling line items.

const WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Customer-facing money: whole dollars. The default for any headline figure. */
export function formatUsd(n: number): string {
  return WHOLE.format(Number.isFinite(n) ? n : 0)
}

/** Money to the cent. Only for internal reconciliation views. */
export function formatUsdCents(n: number): string {
  return CENTS.format(Number.isFinite(n) ? n : 0)
}
