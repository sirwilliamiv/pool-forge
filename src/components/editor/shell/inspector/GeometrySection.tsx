'use client'

import { useState, useEffect } from 'react'
import { useSelectionStore, useShapesStore, isPool } from '@/modules/editor/state'
import { dispatch } from '@/lib/commands/dispatch'
import { FlipHorizontal, Lock } from 'lucide-react'

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

export function GeometrySection() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => s.shapes.find((x) => x.id === selectedId))

  if (!shape) {
    return (
      <Section title="Geometry">
        <div className="px-3 py-2 text-[11px] text-textFaint">No selection</div>
      </Section>
    )
  }

  const lengthFt = shape.width / 12
  const widthFt = shape.height / 12
  const pool = isPool(shape) ? shape : null
  const shallow = pool?.depthShallow ?? 0
  const deep = pool?.depthDeep ?? 0
  const avg = (shallow + deep) / 2
  const slope = lengthFt > 0 ? Math.max(0, deep - shallow) / lengthFt : 0

  function pushGeom(patch: { length?: number; width?: number; avgDepth?: number; shallowDepth?: number; deepDepth?: number; slope?: number }) {
    if (shape!.displayHint?.lockedRatio && (patch.length != null || patch.width != null)) {
      const ratio = widthFt > 0 ? lengthFt / widthFt : 1
      if (patch.length != null) patch.width = patch.length / ratio
      else if (patch.width != null) patch.length = patch.width * ratio
    }
    void dispatch('pool.geometry.update', { id: shape!.id, ...patch })
  }

  return (
    <Section
      title="Geometry"
      actions={
        <>
          <button
            className={
              shape.displayHint?.flippedX
                ? 'text-pfAccentStrong'
                : 'text-textFaint hover:text-foreground'
            }
            title="Flip horizontally"
            onClick={() => void dispatch('pool.flip', { id: shape.id, axis: 'x' })}
          >
            <FlipHorizontal className="h-3 w-3" />
          </button>
          <button
            className={
              shape.displayHint?.lockedRatio
                ? 'text-pfAccentStrong'
                : 'text-textFaint hover:text-foreground'
            }
            title={shape.displayHint?.lockedRatio ? 'Unlock ratio' : 'Lock ratio'}
            onClick={() => void dispatch('pool.lock.ratio', { id: shape.id })}
          >
            <Lock className="h-3 w-3" />
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <NumberField prefix="L" suffix="ft" value={lengthFt} onCommit={(n) => pushGeom({ length: n })} />
        <NumberField prefix="W" suffix="ft" value={widthFt} onCommit={(n) => pushGeom({ width: n })} />
        <NumberField prefix="D̄" suffix="ft" value={avg} onCommit={(n) => pushGeom({ avgDepth: n })} />
      </div>
      {pool ? (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-2">
          <NumberField prefix="Sh" suffix="ft" value={shallow} onCommit={(n) => pushGeom({ shallowDepth: n })} />
          <NumberField prefix="Dp" suffix="ft" value={deep} onCommit={(n) => pushGeom({ deepDepth: n })} />
          <NumberField prefix="Sl" suffix=":1" value={slope === 0 ? 0 : 1 / slope} onCommit={(n) => pushGeom({ slope: n })} />
        </div>
      ) : null}
    </Section>
  )
}

function Section({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-borderLight">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">{title}</h4>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}
