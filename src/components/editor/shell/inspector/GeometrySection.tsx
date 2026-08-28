'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useSelectionStore, useShapesStore, isPool } from '@/modules/editor/state'
import { dispatch } from '@/lib/commands/dispatch'
import {
  MAX_DEPTH_FT,
  MAX_SIZE_FT,
  MIN_DEPTH_FT,
  MIN_SIZE_FT,
  floorSlope,
} from '@/lib/geometry/limits'
import { Circle, FlipHorizontal, Lock } from 'lucide-react'

interface FieldProps {
  prefix: string
  suffix: string
  value: number
  /** Resolves false when the change was refused, and the field goes back. */
  onCommit: (n: number) => Promise<boolean>
  step?: number
  min?: number
  max?: number
}

function NumberField({ prefix, suffix, value, onCommit, step = 0.1, min, max }: FieldProps) {
  const [text, setText] = useState(value.toFixed(1))
  useEffect(() => {
    setText(value.toFixed(1))
  }, [value])

  async function commit() {
    const n = Number(text)
    if (!Number.isFinite(n) || n === value) {
      setText(value.toFixed(1))
      return
    }
    // Put the field back when the command refuses. Nothing did this before, so
    // a refused 99999 stayed on screen next to a pool that had not changed, and
    // the box read as the truth about the drawing when it was not.
    const accepted = await onCommit(n)
    if (!accepted) setText(value.toFixed(1))
  }

  return (
    <label className="flex items-center gap-1 rounded-pfXs bg-rowHover px-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-pfAccent">
      <span className="text-[10px] uppercase tracking-wider text-textFaint">{prefix}</span>
      <input
        type="number"
        step={step}
        // The same bounds the command enforces, declared on the control so the
        // arrow keys and the browser's own validation stop short of them rather
        // than walking a builder into a refusal.
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-full bg-transparent py-1.5 text-right text-[11.5px] tabular-nums outline-none"
      />
      <span className="text-[10px] text-textMuted">{suffix}</span>
    </label>
  )
}

/**
 * A figure the drawing works out, not one anybody types.
 *
 * Average depth and floor slope are both derived from the shallow end, the deep
 * end and the length, all of which have their own boxes two rows down. They
 * used to be rendered as editable inputs, and neither did anything: the
 * geometry command's client half reads length, width and the two depths, so a
 * value typed here parsed cleanly, matched no field, and was dropped by a
 * handler whose complaint went into a `void dispatch(...)` nobody was reading.
 * Showing them as readouts is the smaller and truer of the two available fixes.
 */
function ReadoutField({ prefix, suffix, value }: { prefix: string; suffix: string; value: number }) {
  return (
    <div
      className="flex items-center gap-1 rounded-pfXs px-2 text-textMuted"
      title="Worked out from the shallow end, the deep end and the length"
    >
      <span className="text-[10px] uppercase tracking-wider text-textFaint">{prefix}</span>
      <span className="w-full py-1.5 text-right text-[11.5px] tabular-nums">
        {value.toFixed(1)}
      </span>
      <span className="text-[10px] text-textMuted">{suffix}</span>
    </div>
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
  // Derived in one place and always finite: a pool with no length has no fall
  // rather than an infinite one, and the ":1" below inverts this.
  const slope = floorSlope(shallow, deep, lengthFt)

  /**
   * Send the change, and say so when it is refused.
   *
   * The result used to be thrown away (`void dispatch(...)`), so a refusal was
   * indistinguishable from a success: no toast, no revert, the typed number
   * still sitting in the box. The command's error is written for a person by
   * `src/lib/commands/errors.ts`, so it goes straight into the toast.
   */
  async function pushGeom(patch: {
    lengthFt?: number
    widthFt?: number
    shallowDepthFt?: number
    deepDepthFt?: number
  }): Promise<boolean> {
    if (shape!.displayHint?.lockedRatio && (patch.lengthFt != null || patch.widthFt != null)) {
      const ratio = widthFt > 0 ? lengthFt / widthFt : 1
      if (patch.lengthFt != null) patch.widthFt = patch.lengthFt / ratio
      else if (patch.widthFt != null) patch.lengthFt = patch.widthFt * ratio
    }
    const result = await dispatch('pool.geometry.update', { id: shape!.id, ...patch })
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    return true
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
          {pool ? (
            <button
              className={
                shape.displayHint?.poolShape === 'ellipse'
                  ? 'text-pfAccentStrong'
                  : 'text-textFaint hover:text-foreground'
              }
              title={shape.displayHint?.poolShape === 'ellipse' ? 'Rectangular footprint' : 'Oval footprint'}
              onClick={() =>
                void dispatch('pool.shape.set', {
                  id: shape.id,
                  poolShape: shape.displayHint?.poolShape === 'ellipse' ? 'rectangle' : 'ellipse',
                })
              }
            >
              <Circle className="h-3 w-3" />
            </button>
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <NumberField
          prefix="L"
          suffix="ft"
          value={lengthFt}
          min={MIN_SIZE_FT}
          max={MAX_SIZE_FT}
          onCommit={(n) => pushGeom({ lengthFt: n })}
        />
        <NumberField
          prefix="W"
          suffix="ft"
          value={widthFt}
          min={MIN_SIZE_FT}
          max={MAX_SIZE_FT}
          onCommit={(n) => pushGeom({ widthFt: n })}
        />
        <ReadoutField prefix="D̄" suffix="ft" value={avg} />
      </div>
      {pool ? (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-2">
          <NumberField
            prefix="Sh"
            suffix="ft"
            value={shallow}
            min={MIN_DEPTH_FT}
            max={MAX_DEPTH_FT}
            onCommit={(n) => pushGeom({ shallowDepthFt: n })}
          />
          <NumberField
            prefix="Dp"
            suffix="ft"
            value={deep}
            min={MIN_DEPTH_FT}
            max={MAX_DEPTH_FT}
            onCommit={(n) => pushGeom({ deepDepthFt: n })}
          />
          <ReadoutField prefix="Sl" suffix=":1" value={slope === 0 ? 0 : 1 / slope} />
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
