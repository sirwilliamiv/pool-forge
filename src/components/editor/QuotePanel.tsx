'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Receipt } from 'lucide-react'
import { useShapesStore } from '@/modules/editor/state'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  type PriceBookItemLite,
  type PricingSelections,
} from '@/modules/pricing/engine'
import { loadActivePriceBookItems } from '@/modules/pricing/loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export function QuotePanel() {
  const shapes = useShapesStore((s) => s.shapes)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PriceBookItemLite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selections, setSelections] = useState<PricingSelections>({
    heaterSelected: false,
    saltSystemSelected: false,
    screenSelected: false,
    lightingQuantity: 0,
  })

  useEffect(() => {
    if (!open || items !== null) return
    let cancelled = false
    loadActivePriceBookItems()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load price book')
      })
    return () => {
      cancelled = true
    }
  }, [open, items])

  const measurements = useMemo(() => computeMeasurements(shapes), [shapes])
  const quote = useMemo(
    () => (items ? computeQuote(items, measurements, selections) : null),
    [items, measurements, selections],
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent"
      >
        <Receipt className="h-3.5 w-3.5" />
        Show quote
      </button>
    )
  }

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[360px] flex-col border-l bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Receipt className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Live quote</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="space-y-2 border-b p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Selections
          </p>
          <CheckRow
            label="Heater"
            checked={!!selections.heaterSelected}
            onChange={(v) => setSelections((s) => ({ ...s, heaterSelected: v }))}
          />
          <CheckRow
            label="Salt system"
            checked={!!selections.saltSystemSelected}
            onChange={(v) => setSelections((s) => ({ ...s, saltSystemSelected: v }))}
          />
          <CheckRow
            label="Screen enclosure"
            checked={!!selections.screenSelected}
            onChange={(v) => setSelections((s) => ({ ...s, screenSelected: v }))}
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <Label htmlFor="lighting-qty" className="text-xs">
              Lighting count
            </Label>
            <Input
              id="lighting-qty"
              type="number"
              min={0}
              step={1}
              value={selections.lightingQuantity ?? 0}
              onChange={(e) => {
                const n = Number(e.currentTarget.value)
                setSelections((s) => ({ ...s, lightingQuantity: Number.isFinite(n) ? n : 0 }))
              }}
              className="h-7 w-16 text-xs"
            />
          </div>
        </section>

        <section className="p-3">
          {error ? (
            <p className="text-xs text-destructive">Error: {error}</p>
          ) : !quote ? (
            <p className="text-xs text-muted-foreground">Loading price book…</p>
          ) : quote.lineItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Draw a pool or deck to populate quote line items.
            </p>
          ) : (
            <QuoteLines quote={quote} />
          )}
        </section>
      </div>

      <div className="border-t bg-muted/40 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total investment
          </span>
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {quote ? USD.format(quote.total) : '—'}
          </span>
        </div>
      </div>
    </aside>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
      />
      <span>{label}</span>
    </label>
  )
}

function QuoteLines({ quote }: { quote: ReturnType<typeof computeQuote> }) {
  const grouped = quote.lineItems.reduce<Record<string, typeof quote.lineItems>>((acc, l) => {
    const key = l.category || 'Misc'
    const bucket = acc[key] ?? []
    bucket.push(l)
    acc[key] = bucket
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([cat, lines]) => (
        <div key={cat} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {cat}
          </p>
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.itemId} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{l.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {NUM.format(l.quantity)} × {USD.format(l.unitPrice)} · {l.source}
                  </p>
                </div>
                <span className="font-mono tabular-nums">{USD.format(l.total)}</span>
              </li>
            ))}
          </ul>
          <Separator />
        </div>
      ))}
    </div>
  )
}
