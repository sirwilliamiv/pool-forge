'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QuoteLineItemView {
  id: string
  name: string
  source: string
  total: number | string
}

interface QuoteView {
  id: string
  subtotal: number | string
  total: number | string
  delta?: number | string
  lineItems: QuoteLineItemView[]
}

interface QuoteDockProps {
  quote: QuoteView | null
}

const CATEGORY_ORDER: { key: string; label: string; swatch: string }[] = [
  { key: 'pool', label: 'Pool shell & finish', swatch: 'bg-sky-500' },
  { key: 'spa', label: 'Spa', swatch: 'bg-orange-400' },
  { key: 'equipment', label: 'Equipment', swatch: 'bg-violet-500' },
  { key: 'deck', label: 'Deck & coping', swatch: 'bg-emerald-500' },
  { key: 'lighting', label: 'Lighting & features', swatch: 'bg-pink-500' },
]

const PERMITS_DEFAULT = 2000

function toNumber(v: number | string | undefined | null): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

function fmtDelta(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmt(Math.abs(n))}`
}

function classifySource(source: string): string {
  const s = source.toLowerCase()
  if (s.includes('spa')) return 'spa'
  if (s.includes('deck') || s.includes('coping') || s.includes('travertine'))
    return 'deck'
  if (s.includes('light') || s.includes('led') || s.includes('feature'))
    return 'lighting'
  if (
    s.includes('pump') ||
    s.includes('heater') ||
    s.includes('filter') ||
    s.includes('equipment') ||
    s.includes('automation')
  )
    return 'equipment'
  return 'pool'
}

export function QuoteDock({ quote }: QuoteDockProps) {
  const [expanded, setExpanded] = useState(false)

  const totals = useMemo(() => {
    if (!quote) return null
    const buckets: Record<string, number> = {}
    for (const li of quote.lineItems) {
      const key = classifySource(li.source)
      buckets[key] = (buckets[key] ?? 0) + toNumber(li.total)
    }
    return buckets
  }, [quote])

  if (!quote) {
    return (
      <div
        className={cn(
          'pointer-events-auto rounded-pfMd border border-border bg-white shadow-pfMd',
          'w-60 p-3',
        )}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">
          Live quote
        </div>
        <div className="mt-1 text-sm text-textMuted">No quote yet.</div>
      </div>
    )
  }

  const total = toNumber(quote.total)
  const subtotal = toNumber(quote.subtotal)
  const delta = toNumber(quote.delta)

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
              {fmt(total)}
            </span>
            {delta !== 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                  delta > 0
                    ? 'bg-pfAccentSoft text-pfAccentStrong'
                    : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {fmtDelta(delta)}
              </span>
            )}
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
            {CATEGORY_ORDER.map(({ key, label, swatch }) => (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-foreground">
                  <span
                    className={cn('h-2.5 w-2.5 rounded-full', swatch)}
                    aria-hidden
                  />
                  {label}
                </span>
                <span className="tabular-nums text-textMuted">
                  {fmt(totals?.[key] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-borderLight pt-2">
            <div className="flex items-center justify-between text-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-textMuted">
              <span>Permits & misc</span>
              <span className="tabular-nums">{fmt(PERMITS_DEFAULT)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-[11px]">
              Compare options
            </Button>
            <Button size="sm" className="flex-1 text-[11px]">
              Generate proposal
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
