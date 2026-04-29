'use client'

import { useMemo } from 'react'
import { useEditorStore, useSelectionStore, useShapesStore } from '@/modules/editor/state'
import { computeMeasurements } from '@/modules/measurements/engine'

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

function fmt(n: number, hidden: boolean): string {
  if (hidden || !Number.isFinite(n) || n === 0) return '—'
  return NUM.format(n)
}

export function StatusBar() {
  const shapes = useShapesStore((s) => s.shapes)
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const activeTool = useEditorStore((s) => s.activeTool)
  const zoom = useEditorStore((s) => s.zoom)

  const m = useMemo(() => computeMeasurements(shapes), [shapes])

  return (
    <div className="flex h-8 items-center justify-between gap-4 border-t bg-background px-3 text-xs text-muted-foreground">
      <div className="flex flex-1 items-center gap-4 overflow-x-auto">
        <Stat label="Pool sqft" value={fmt(m.poolSurfaceArea, !m.hasPool)} />
        <Stat label="Perimeter LF" value={fmt(m.poolPerimeter, !m.hasPool)} />
        <Stat label="Gallons" value={fmt(m.poolGallons, !m.hasPool)} />
        <Stat label="Wetted sqft" value={fmt(m.poolWettedArea, !m.hasPool)} />
        <Sep />
        <Stat label="Deck sqft" value={fmt(m.deckArea, !m.hasDeck)} />
        <Stat label="Coping LF" value={fmt(m.copingLinearFeet, !m.hasPool)} />
        <Sep />
        <Stat label="Features" value={m.featureCount === 0 ? '—' : String(m.featureCount)} />
      </div>
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span className="font-mono">{activeTool}</span>
        <span>zoom {Math.round(zoom * 100)}%</span>
        <span className="rounded bg-muted px-1.5 py-0.5">
          {selectedIds.length === 0 ? 'no selection' : `${selectedIds.length} selected`}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </span>
  )
}

function Sep() {
  return <span className="h-3 w-px bg-border" aria-hidden />
}
