import { AlertTriangle, Check, Info, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CoverageRow, CoverageStatus } from '@/modules/onboarding/coverage'

// What this book cannot price, said where somebody can fix it.
//
// The quote already reports this per project: draw a waterfall against a book
// with no water feature line and the quote says the waterfall is unpriced. That
// is the right information at the wrong moment, because by then a customer is
// in the room. The same computation, over the same stencil mapping, runs here
// against the book as a whole.

const STATUS_STYLE: Record<
  CoverageStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  PRICED: {
    label: 'Priced',
    className: 'text-emerald-700 dark:text-emerald-400',
    Icon: Check,
  },
  MISSING: {
    label: 'No line',
    className: 'text-red-700 dark:text-red-400',
    Icon: AlertTriangle,
  },
  UNIT_UNMEASURED: {
    label: 'Never bills',
    className: 'text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  PER_JOB: {
    label: 'Per job',
    className: 'text-muted-foreground',
    Icon: Wrench,
  },
}

export function PriceBookCoverage({
  rows,
  placeholderCount,
  placeholderNotice,
}: {
  rows: readonly CoverageRow[]
  /** Lines still holding the numbers Pool Forge invented. */
  placeholderCount: number
  placeholderNotice: string
}) {
  const gaps = rows.filter(
    (row) => row.status === 'MISSING' || row.status === 'UNIT_UNMEASURED',
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="text-base">What this book can price</CardTitle>
          <span className="text-xs text-muted-foreground">
            {rows.length - gaps.length} of {rows.length} drawing categories covered
          </span>
        </div>
        {gaps.length === 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            Every category the drawing tools produce has a line behind it.
          </p>
        ) : (
          <p className="pt-1 text-xs text-red-700 dark:text-red-400">
            {gaps.length === 1
              ? `${gaps[0]?.label} will quote at nothing. `
              : `${gaps.map((gap) => gap.label).join(', ')} will quote at nothing. `}
            You would find this out on the quote; better to find it out here.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {placeholderCount > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">
                {placeholderCount} {placeholderCount === 1 ? 'line is' : 'lines are'} still at the
                starting price.
              </span>{' '}
              {placeholderNotice}
            </span>
          </p>
        ) : null}

        <ul className="divide-y text-sm">
          {rows.map((row) => {
            const style = STATUS_STYLE[row.status]
            const Icon = style.Icon
            return (
              <li key={row.category} className="flex items-start gap-3 py-2">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{row.label}</span>
                    <span className={`text-xs ${style.className}`}>{style.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
