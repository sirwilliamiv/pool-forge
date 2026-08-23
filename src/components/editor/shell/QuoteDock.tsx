'use client'

import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatUsd } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useLiveQuote } from './LiveQuote'
import { groupTotals } from './quote-groups'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto w-60 rounded-pfMd border border-border bg-white p-3 shadow-pfMd">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">
        Live quote
      </div>
      {children}
    </div>
  )
}

function fmtQuantity(n: number): string {
  return n === Math.round(n) ? String(n) : n.toFixed(1)
}

export function QuoteDock() {
  const quote = useLiveQuote()
  const [expanded, setExpanded] = useState(false)

  const groups = useMemo(
    () => (quote ? groupTotals(quote.lineItems).filter((g) => g.total > 0) : []),
    [quote],
  )

  // No price book loaded into the client at all: say so, do not print a figure.
  if (!quote) {
    return (
      <Shell>
        <div className="mt-1 text-sm text-textMuted">Not priced.</div>
        <p className="mt-1 text-[11px] leading-snug text-textFaint">
          This project has no pricing inputs loaded, so no total can be shown.
        </p>
      </Shell>
    )
  }

  if (quote.status === 'NOTHING_DRAWN') {
    return (
      <Shell>
        <div className="mt-1 text-sm font-medium text-foreground">No price yet</div>
        <p className="mt-1 text-[11px] leading-snug text-textFaint">
          Nothing is drawn, so there is nothing to price. Place a pool to start the quote.
        </p>
      </Shell>
    )
  }

  if (quote.status === 'NO_PRICE_BOOK') {
    return (
      <Shell>
        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Cannot price this
        </div>
        <p className="mt-1 text-[11px] leading-snug text-textFaint">
          There is no active price book for this company, so the design cannot be costed. Add one
          in Price book, then reopen this project.
        </p>
      </Shell>
    )
  }

  const groupedTotal = groups.reduce((sum, g) => sum + g.total, 0)
  // Anything the grouping did not claim still has to appear, or the parts stop
  // adding up to the subtotal.
  const otherTotal = Math.round((quote.subtotal - groupedTotal) * 100) / 100

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-pfMd border border-border bg-white shadow-pfMd transition-all',
        expanded ? 'w-80' : 'w-60',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-pfMd p-3 text-left hover:bg-rowHover focus:outline-none focus:ring-2 focus:ring-pfAccent"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">
            Live quote
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[18px] font-semibold tabular-nums text-foreground">
              {formatUsd(quote.total)}
            </span>
            <span className="text-[10px] text-textFaint">incl. tax</span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-textMuted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-textMuted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-borderLight px-3 py-2 text-xs">
          <ul className="space-y-1.5">
            {groups.map(({ label, swatch, total }) => (
              <li key={label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-foreground">
                  <span className={cn('h-2.5 w-2.5 rounded-full', swatch)} aria-hidden />
                  {label}
                </span>
                <span className="tabular-nums text-textMuted">{formatUsd(total)}</span>
              </li>
            ))}
            {otherTotal !== 0 && (
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden />
                  Other
                </span>
                <span className="tabular-nums text-textMuted">{formatUsd(otherTotal)}</span>
              </li>
            )}
          </ul>
          <div className="mt-2 border-t border-borderLight pt-2">
            <div className="flex items-center justify-between text-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatUsd(quote.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-textMuted">
              <span>Sales tax ({quote.taxRatePct}%)</span>
              <span className="tabular-nums">{formatUsd(quote.taxAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-borderLight pt-1 text-[13px] font-semibold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">{formatUsd(quote.total)}</span>
            </div>
          </div>

          {quote.unpriced.length > 0 && (
            <div className="mt-2 rounded-pfSm border border-amber-200 bg-amber-50 px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                Drawn but not priced
              </div>
              <ul className="mt-1 space-y-0.5">
                {quote.unpriced.map((u) => (
                  <li key={u.category} className="text-[11px] leading-snug text-amber-900">
                    <span className="font-medium">
                      {u.label} ({fmtQuantity(u.quantity)} {u.unit})
                    </span>{': '}
                    {u.reason}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
