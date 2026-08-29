'use client'

import { ChevronDown, Square } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { stencilsByCategory } from '@/modules/editor/stencils'
import { StencilCategory } from '@/modules/editor/stencils/types'

// Derived from the catalogue, never listed here.
//
// This used to hold its own array of four, while the catalogue held seventeen.
// A builder reaching for the obvious tool saw a quarter of what exists — every
// pool-and-spa combination and every step variant was missing — and the two
// lists had no way of noticing they disagreed. Adding a pool shape to the
// catalogue now puts it in the picker.
const POOL_SHAPES = stencilsByCategory()[StencilCategory.POOL_SHAPE]

/** The footprint this shape drops, in feet, the way a builder would say it. */
function sizeLabel(shape: (typeof POOL_SHAPES)[number]): string {
  const dim = shape.defaultDimensions
  const width = dim.unit === 'ft' ? dim.width : dim.width / 12
  const height = dim.unit === 'ft' ? dim.height : dim.height / 12
  const round = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))
  return `${round(width)}' × ${round(height)}'`
}

export function PoolShapePicker() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const setActiveStencil = useEditorStore((s) => s.setActiveStencil)
  const active = activeTool === 'tool.pool-shape'

  function pick(stencilId: string) {
    setActiveStencil(stencilId)
    setActiveTool('tool.pool-shape')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Pool shape (R)"
          aria-label="Pool shape"
          aria-pressed={active}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-pfSm transition focus:outline-none focus:ring-2 focus:ring-pfAccent',
            active
              ? 'bg-foreground text-white'
              : 'text-textMuted hover:bg-rowHover hover:text-foreground',
          )}
        >
          <Square className="h-4 w-4" aria-hidden />
          <span
            className={cn(
              'pointer-events-none absolute bottom-0.5 right-0.5 font-mono text-[8px]',
              active ? 'text-white/70' : 'text-textFaint',
            )}
          >
            R
          </span>
          <ChevronDown
            className={cn(
              'pointer-events-none absolute -bottom-0.5 right-0.5 h-2.5 w-2.5',
              active ? 'text-white/70' : 'text-textFaint',
            )}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      {/* Seventeen shapes will not fit on screen at once, so the list scrolls
          rather than running off the bottom of the viewport. */}
      <DropdownMenuContent align="center" side="top" className="max-h-80 w-72 overflow-y-auto">
        {POOL_SHAPES.map((shape) => (
          <DropdownMenuItem
            key={shape.id}
            onSelect={() => pick(shape.id)}
            className="flex items-baseline justify-between gap-3"
          >
            {/* Full name, plus the size it drops. "Roman two master" and "Roman
                two point one master" are different pools, and a list of names
                alone gave a first-time user no way to tell them apart. */}
            <span>{shape.name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-textFaint">
              {sizeLabel(shape)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
