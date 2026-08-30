'use client'

import { useEffect, useState } from 'react'
import { Box, Waves } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { polygonArea } from '@/lib/geometry/polygon-footprint'
import { isSketchPath } from '@/modules/editor/state/shapes'
import { useSelectionStore, useShapesStore } from '@/modules/editor/state'
import { SPECTRUM } from '@/lib/brand'

/** The four hues a fill may take. Red and amber are excluded: they mean error and warning. */
const FILL_HUES = ['blue', 'green', 'orange', 'purple'] as const

/**
 * What a drawn path can become.
 *
 * The bridge Kelby asked for: draw in plan, name it, then press a button and
 * have it become a real object with depth, measurements and a price. Until that
 * press it is construction geometry and nothing else, which is the point:
 * drawing a line should never quietly add money to a quote.
 */
export function SketchSection() {
  const selectedIds = useSelectionStore(s => s.selectedIds)
  const shapes = useShapesStore(s => s.shapes)
  const selected = shapes.find(shape => shape.id === selectedIds[0])
  const sketch = selected && isSketchPath(selected) ? selected : null

  const [label, setLabel] = useState('')
  useEffect(() => {
    setLabel(sketch?.labelText ?? '')
  }, [sketch?.id, sketch?.labelText])

  if (!sketch) return null

  const areaSqft = sketch.closed ? polygonArea(sketch.points) / 144 : 0

  async function convert(command: 'sketch.toPool' | 'sketch.toDeck', input: object) {
    if (!sketch) return
    const result = await dispatch(command, { id: sketch.id, ...input })
    if (!result.ok) toast.error(result.error)
  }

  async function fill(color: (typeof FILL_HUES)[number] | 'none') {
    if (!sketch) return
    const result = await dispatch('sketch.fill.set', { id: sketch.id, color })
    if (!result.ok) toast.error(result.error)
  }

  return (
    <section className="border-b border-borderLight px-3 py-3">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-textFaint">
        Drawn {sketch.closed ? 'outline' : 'line'}
      </h3>

      <label className="mb-2 block">
        <span className="sr-only">What this is</span>
        <input
          value={label}
          onChange={event => setLabel(event.target.value)}
          onBlur={() => {
            const next = label.trim()
            if (next === (sketch.labelText ?? '')) return
            void dispatch('sketch.label', { id: sketch.id, label: next })
          }}
          placeholder="House, lot line, deck edge…"
          className="w-full rounded-pfSm border border-input bg-white px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-pfAccent"
        />
      </label>

      <p className="mb-3 text-[11px] text-textMuted">
        {sketch.points.length} points
        {sketch.closed ? ` · ${areaSqft.toFixed(0)} sq ft` : ' · open, no area'}
      </p>

      {sketch.closed ? (
        <div className="mb-3">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-textFaint">
            Fill
          </span>
          <div className="flex items-center gap-1.5">
            {FILL_HUES.map(hue => (
              <button
                key={hue}
                type="button"
                aria-label={`Fill ${hue}`}
                aria-pressed={sketch.fillColor === hue}
                onClick={() => void fill(hue)}
                style={{ backgroundColor: SPECTRUM[hue] }}
                className={`h-6 w-6 rounded-full border-2 transition-shadow ${
                  sketch.fillColor === hue ? 'border-foreground' : 'border-transparent'
                }`}
              />
            ))}
            <button
              type="button"
              aria-label="No fill"
              aria-pressed={!sketch.fillColor}
              onClick={() => void fill('none')}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[10px] text-textMuted transition-shadow ${
                !sketch.fillColor ? 'border-foreground' : 'border-input'
              }`}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {sketch.closed ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void convert('sketch.toPool', {})}
            className="flex w-full items-center justify-center gap-2 rounded-pfSm bg-foreground px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-foreground/90"
          >
            <Waves className="h-3.5 w-3.5" aria-hidden />
            Convert to a 3D pool
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void convert('sketch.toDeck', { surface: 'concrete' })}
              className="flex-1 rounded-pfSm border border-border px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-rowHover"
            >
              Concrete
            </button>
            <button
              type="button"
              onClick={() => void convert('sketch.toDeck', { surface: 'paver' })}
              className="flex-1 rounded-pfSm border border-border px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-rowHover"
            >
              Pavers
            </button>
            <button
              type="button"
              onClick={() => void convert('sketch.toDeck', { surface: 'grass' })}
              className="flex-1 rounded-pfSm border border-border px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-rowHover"
            >
              Lawn
            </button>
          </div>
        </div>
      ) : (
        // Said plainly rather than by disabling a button with no explanation.
        <p className="flex items-start gap-1.5 rounded-pfSm bg-rowHover px-2 py-2 text-[11px] text-textMuted">
          <Box className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          An open line has no inside. Close the outline, by ending near where it
          started, to turn it into a pool or a deck.
        </p>
      )}
    </section>
  )
}
