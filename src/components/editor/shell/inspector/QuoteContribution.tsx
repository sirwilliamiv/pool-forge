'use client'

import { useSelectionStore, useShapesStore } from '@/modules/editor/state'
import { formatUsd } from '@/lib/money'
import { Info } from 'lucide-react'
import { useLiveQuote, useShapeContribution } from '../LiveQuote'

function fmtSigned(n: number): string {
  if (n === 0) return formatUsd(0)
  return `${n > 0 ? '+' : '−'}${formatUsd(Math.abs(n))}`
}

export function QuoteContribution() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const selectedName = useShapesStore((s) => {
    const shape = s.shapes.find((x) => x.id === selectedId)
    if (!shape) return null
    return shape.name ?? shape.kind.replace(/_/g, ' ').toLowerCase()
  })
  const quote = useLiveQuote()
  const contribution = useShapeContribution(selectedId)

  // Nothing selected: report the whole project, and say that is what it is.
  // The panel used to sum every line on the quote and label it the selected
  // object's contribution, so a $39,194 pool shell was attributed to whatever
  // happened to be clicked.
  if (!selectedId || !contribution) {
    return (
      <Section title="Quote contribution">
        {quote && quote.status === 'PRICED' ? (
          <>
            <Amount value={formatUsd(quote.total)} />
            <p className="mt-1 text-[11px] text-textMuted">
              Whole project, including tax. Select an object to see what it adds.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-textFaint">
            {quote?.status === 'NO_PRICE_BOOK'
              ? 'No active price book, so nothing here can be costed.'
              : 'Nothing drawn yet, so there is nothing to price.'}
          </p>
        )}
      </Section>
    )
  }

  const isFree = contribution.total === 0

  return (
    <Section title="Quote contribution">
      <Amount value={fmtSigned(contribution.total)} />
      <p className="mt-1 text-[11px] text-textMuted">
        What {selectedName ?? 'this object'} adds to the total.
      </p>
      <div className="mt-3 space-y-1">
        {contribution.changedLines.length === 0 ? (
          <div className="text-[11px] text-textFaint">
            No price-book line responds to this object.
          </div>
        ) : (
          contribution.changedLines.slice(0, 4).map((l) => (
            <div key={l.name} className="flex items-baseline justify-between text-[11px]">
              <span className="truncate text-textMuted">{l.name}</span>
              <span className="tabular-nums text-foreground">{fmtSigned(l.delta)}</span>
            </div>
          ))
        )}
      </div>
      {isFree && (
        <div className="mt-3 flex items-start gap-2 rounded-pfSm bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Removing this would not change the price. Nothing in the active price book charges for
            it.
          </span>
        </div>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-borderLight px-3 py-3">
      <div className="rounded-pfMd border border-cyan-200 bg-cyan-50/60 p-3">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-textMuted">
          {title}
        </div>
        {children}
      </div>
    </section>
  )
}

function Amount({ value }: { value: string }) {
  return (
    <div className="mt-1 text-[22px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
      {value}
    </div>
  )
}
