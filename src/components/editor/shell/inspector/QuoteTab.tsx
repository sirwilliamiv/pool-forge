'use client'

import { useMemo } from 'react'
import { useSelectionStore } from '@/modules/editor/state'
import { categoryLabel, type QuoteLine } from '@/modules/pricing/engine'
import { formatUsd } from '@/lib/money'
import { PriceCategory } from '@prisma/client'
import { useLiveQuote } from '../LiveQuote'

const fmtMoney = formatUsd

function fmtQty(n: number): string {
  if (n === Math.round(n)) return String(n)
  return n.toFixed(1)
}

export function QuoteTab() {
  const quote = useLiveQuote()
  const selectedId = useSelectionStore((s) => s.selectedIds[0])

  const groups = useMemo(() => {
    if (!quote) return []
    const byCategory = new Map<PriceCategory, QuoteLine[]>()
    for (const line of quote.lineItems) {
      const list = byCategory.get(line.category) ?? []
      list.push(line)
      byCategory.set(line.category, list)
    }
    return Array.from(byCategory.entries())
  }, [quote])

  if (!quote) {
    return (
      <p className="px-3 py-4 text-[11.5px] text-textFaint">
        No pricing inputs are loaded for this project, so nothing can be costed here.
      </p>
    )
  }

  if (quote.status === 'NOTHING_DRAWN') {
    return (
      <p className="px-3 py-4 text-[11.5px] text-textFaint">
        Nothing is drawn yet. Place a pool and the quote builds itself from the drawing.
      </p>
    )
  }

  if (quote.status === 'NO_PRICE_BOOK') {
    return (
      <p className="px-3 py-4 text-[11.5px] text-amber-800">
        There is no active price book for this company, so this design cannot be priced. Add one
        under Price book, then reopen the project.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {groups.map(([category, lines]) => {
        const subtotal = lines.reduce((sum, l) => sum + l.total, 0)
        return (
          <section key={category} className="border-b border-borderLight">
            <header className="flex items-center justify-between px-3 pb-1 pt-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
                {categoryLabel(category)}
              </h4>
              <span className="text-[10px] tabular-nums text-textMuted">
                {fmtMoney(subtotal)}
              </span>
            </header>
            <ul className="px-2 pb-2">
              {lines.map((line) => {
                const matchesSelection =
                  selectedId !== undefined && line.source.includes(selectedId)
                return (
                  <li
                    key={line.itemId}
                    className={
                      'flex items-center justify-between gap-2 rounded-pfXs px-1 py-1 text-[11.5px] ' +
                      (matchesSelection ? 'bg-pfAccentSoft' : '')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground">{line.name}</div>
                      <div className="truncate text-[10px] text-textFaint">
                        {fmtQty(line.quantity)} × {fmtMoney(line.unitPrice)}
                      </div>
                    </div>
                    <div className="shrink-0 tabular-nums text-foreground">
                      {fmtMoney(line.total)}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {quote.unpriced.length > 0 && (
        <div className="border-b border-borderLight bg-amber-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-amber-800">
            Drawn but not priced
          </div>
          <ul className="mt-1 space-y-0.5">
            {quote.unpriced.map((u) => (
              // Keyed on the label as well as the category. One category can now
              // hold several entries — a heater and a salt system are both
              // equipment — and a duplicate React key drops all but one of them,
              // which would put the silence straight back.
              <li key={`${u.category}:${u.label}`} className="text-[11px] leading-snug text-amber-900">
                {u.label}: {u.reason}.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-3 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-textMuted">Subtotal</span>
          <span className="tabular-nums text-foreground">{fmtMoney(quote.subtotal)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[12px]">
          <span className="text-textMuted">Sales tax ({quote.taxRatePct}%)</span>
          <span className="tabular-nums text-foreground">{fmtMoney(quote.taxAmount)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-borderLight pt-1 text-[14px] font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{fmtMoney(quote.total)}</span>
        </div>
      </div>
    </div>
  )
}
