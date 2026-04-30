'use client'

import { useState, useEffect } from 'react'
import { useSelectionStore, useShapesStore } from '@/modules/editor/state'
import { dispatch } from '@/lib/commands/dispatch'
import { Crosshair } from 'lucide-react'

interface FieldProps {
  prefix: string
  suffix: string
  value: number
  onCommit: (n: number) => void
  step?: number
}

function NumberField({ prefix, suffix, value, onCommit, step = 0.1 }: FieldProps) {
  const [text, setText] = useState(value.toFixed(1))
  useEffect(() => {
    setText(value.toFixed(1))
  }, [value])

  function commit() {
    const n = Number(text)
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setText(value.toFixed(1))
  }

  return (
    <label className="flex items-center gap-1 rounded-pfXs bg-rowHover px-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-pfAccent">
      <span className="text-[10px] uppercase tracking-wider text-textFaint">{prefix}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-full bg-transparent py-1.5 text-right text-[11.5px] tabular-nums outline-none"
      />
      <span className="text-[10px] text-textMuted">{suffix}</span>
    </label>
  )
}

export function PositionSection() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => s.shapes.find((x) => x.id === selectedId))

  if (!shape) {
    return (
      <Section title="Position" icon={<Crosshair className="h-3 w-3" />}>
        <div className="px-3 py-2 text-[11px] text-textFaint">No selection</div>
      </Section>
    )
  }

  const xFt = shape.x / 12
  const yFt = shape.y / 12

  function commitX(ft: number) {
    void dispatch('move.shape', { id: shape!.id, x: ft * 12, y: shape!.y })
  }
  function commitY(ft: number) {
    void dispatch('move.shape', { id: shape!.id, x: shape!.x, y: ft * 12 })
  }
  function commitRotation(deg: number) {
    void dispatch('rotate.shape', { id: shape!.id, degrees: deg })
  }

  return (
    <Section title="Position" icon={<Crosshair className="h-3 w-3" />}>
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <NumberField prefix="X" suffix="ft" value={xFt} onCommit={commitX} />
        <NumberField prefix="Y" suffix="ft" value={yFt} onCommit={commitY} />
        <NumberField prefix="R" suffix="°" value={shape.rotation} onCommit={commitRotation} step={1} />
      </div>
      <div className="mx-3 mb-2 space-y-1 border-t border-borderLight pt-2">
        <DerivedRow label="From house" value="—" />
        <DerivedRow label="Setback" value="—" />
      </div>
    </Section>
  )
}

function DerivedRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-textFaint">{label}</span>
      <span className={warn ? 'text-pfError tabular-nums' : 'text-foreground tabular-nums'}>{value}</span>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-borderLight">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">{title}</h4>
        {icon ? <button className="text-textFaint hover:text-foreground">{icon}</button> : null}
      </header>
      {children}
    </section>
  )
}
