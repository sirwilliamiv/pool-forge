'use client'

import { useSelectionStore } from '@/modules/editor/state'
import type { QuoteSummary } from '@/modules/pricing/engine'
import { Info } from 'lucide-react'

interface QuoteContributionProps {
  // Optional pre-computed quote, passed down from a server component or context.
  // v1: parent route can omit and we render placeholders.
  quote?: QuoteSummary
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function QuoteContribution({ quote }: QuoteContributionProps) {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])

  // Lines whose `source` references this id contribute to the selection's quote.
  // The pricing engine emits source strings like `pool.surface` rather than
  // shape ids today; until Track G surfaces shape-anchored sourcing, fall back
  // to summing all lines when nothing matches.
  const lines = quote?.lineItems ?? []
  const matched = selectedId ? lines.filter((l) => l.source.includes(selectedId)) : []
  const effective = matched.length > 0 ? matched : lines
  const total = effective.reduce((acc, l) => acc + l.total, 0)
  const top = effective.slice(0, 4)

  return (
    <section className="border-b border-borderLight px-3 py-3">
      <div className="rounded-pfMd border border-cyan-200 bg-cyan-50/60 p-3">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-textMuted">
          Contribution to quote
        </div>
        <div className="mt-1 text-[22px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
          {fmtUsd(total)}
        </div>
        <div className="mt-3 space-y-1">
          {top.length === 0 ? (
            <div className="text-[11px] text-textFaint">
              {/* TODO: route page should pass `quote` (computeQuote(...)) in Wave 2. */}
              No quote loaded yet
            </div>
          ) : (
            top.map((l) => (
              <div
                key={`${l.itemId}-${l.source}`}
                className="flex items-baseline justify-between text-[11px]"
              >
                <span className="truncate text-textMuted">{l.name}</span>
                <span className="tabular-nums text-foreground">{fmtUsd(l.total)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-pfSm bg-pfAccentSoft px-3 py-2 text-[11px] text-pfAccentStrong">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          {/* TODO: derive contextual hint per shape kind (Track G or follow-on). */}
          Widening to 16&apos; adds <span className="font-semibold tabular-nums">+$3,160</span>
        </span>
      </div>
    </section>
  )
}
