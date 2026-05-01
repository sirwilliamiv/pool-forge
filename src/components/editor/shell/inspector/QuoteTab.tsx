'use client'

import { useMemo } from 'react'
import { useSelectionStore } from '@/modules/editor/state'
import type { QuoteSummary, QuoteLine } from '@/modules/pricing/engine'
import { PriceCategory } from '@prisma/client'

interface QuoteTabProps {
  quote?: QuoteSummary | null | undefined
}

const CATEGORY_LABEL: Partial<Record<PriceCategory, string>> = {
  [PriceCategory.POOL]: 'Pool',
  [PriceCategory.SPA]: 'Spa',
  [PriceCategory.DECK]: 'Deck',
  [PriceCategory.LANAI]: 'Lanai',
  [PriceCategory.COPING]: 'Coping',
  [PriceCategory.DRAIN]: 'Drains',
  [PriceCategory.BENCH]: 'Benches',
  [PriceCategory.EQUIPMENT]: 'Equipment',
  [PriceCategory.LIGHTING]: 'Lighting',
  [PriceCategory.WATER_FEATURE]: 'Water features',
  [PriceCategory.SCREEN]: 'Screen',
  [PriceCategory.FENCE]: 'Fence',
  [PriceCategory.WALL]: 'Walls',
  [PriceCategory.ELECTRICAL]: 'Electrical',
  [PriceCategory.MISC]: 'Misc',
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtQty(n: number): string {
  if (n === Math.round(n)) return String(n)
  return n.toFixed(1)
}

export function QuoteTab({ quote }: QuoteTabProps) {
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
        No quote yet — generate one from the dock.
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
                {CATEGORY_LABEL[category] ?? category}
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

      <div className="px-3 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-textMuted">Subtotal</span>
          <span className="tabular-nums text-foreground">{fmtMoney(quote.subtotal)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[14px] font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{fmtMoney(quote.total)}</span>
        </div>
      </div>
    </div>
  )
}
