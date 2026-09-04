'use client'

import { useMemo } from 'react'
import { useShapesStore } from '@/modules/editor/state'
import { computeMeasurements } from '@/modules/measurements/engine'

interface MetricProps {
  label: string
  value: string
  unit: string
}

function Metric({ label, value, unit }: MetricProps) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-textMuted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[14px] font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-[10px] text-textMuted">{unit}</span>
      </div>
    </div>
  )
}

export function ComputedMetrics() {
  const shapes = useShapesStore((s) => s.shapes)
  // Memoised: this ran the whole measurement pass in the render body on every
  // re-render, and the inspector re-renders on every drag frame.
  const m = useMemo(() => computeMeasurements(shapes), [shapes])

  return (
    <section className="border-b border-borderLight">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">Computed</h4>
        <div className="flex items-center gap-1.5 text-[10px] text-textFaint">
          <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          live
        </div>
      </header>
      <div className="grid grid-cols-2 gap-px bg-borderLight">
        <Metric label="Surface area" value={m.poolSurfaceArea.toFixed(0)} unit="sq ft" />
        <Metric label="Perimeter" value={m.poolPerimeter.toFixed(0)} unit="LF" />
        <Metric label="Volume" value={m.poolGallons.toLocaleString(undefined, { maximumFractionDigits: 0 })} unit="gal" />
        <Metric label="Wetted area" value={m.poolWettedArea.toFixed(0)} unit="sq ft" />
      </div>
    </section>
  )
}
