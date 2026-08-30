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
    className: 'text-theme-muted',
    Icon: Check,
  },
  MISSING: {
    label: 'No line',
    className: 'text-brand-red',
    Icon: AlertTriangle,
  },
  UNIT_UNMEASURED: {
    label: 'Never bills',
    className: 'text-brand-orange',
    Icon: AlertTriangle,
  },
  PER_JOB: {
    label: 'Per job',
    className: 'text-theme-muted',
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
          <CardTitle className="text-bodyL font-medium">What this book can price</CardTitle>
          <span className="font-brandMono text-formLabel tracking-[0.5px] text-theme-muted">
            {rows.length - gaps.length} of {rows.length} drawing categories covered
          </span>
        </div>
        {gaps.length === 0 ? (
          <p className="pt-1 text-bodyS text-theme-muted">
            Every category the drawing tools produce has a line behind it.
          </p>
        ) : (
          <p className="pt-1 text-bodyS text-brand-red">
            {gaps.length === 1
              ? `${gaps[0]?.label} will quote at nothing. `
              : `${gaps.map((gap) => gap.label).join(', ')} will quote at nothing. `}
            You would find this out on the quote; better to find it out here.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {placeholderCount > 0 ? (
          <p className="flex items-start gap-2 rounded-brand border border-theme-line bg-theme-card p-2.5 text-bodyS text-theme-fg">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-orange" aria-hidden />
            <span>
              <span className="font-medium">
                {placeholderCount} {placeholderCount === 1 ? 'line is' : 'lines are'} still at the
                starting price.
              </span>{' '}
              {placeholderNotice}
            </span>
          </p>
        ) : null}

        <ul className="divide-y divide-theme-line text-bodyS">
          {rows.map((row) => {
            const style = STATUS_STYLE[row.status]
            const Icon = style.Icon
            return (
              <li key={row.category} className="flex items-start gap-3 py-2">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-theme-fg">{row.label}</span>
                    <span
                      className={`font-brandMono text-formLabel uppercase tracking-[0.6px] ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="text-bodyS text-theme-muted">{row.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
