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

interface PoolShape {
  stencilId: string
  label: string
}

const POOL_SHAPES: PoolShape[] = [
  { stencilId: 'pool.rectangle', label: 'Rectangle' },
  { stencilId: 'pool.roman', label: 'Roman' },
  { stencilId: 'pool.grecian', label: 'Grecian' },
  { stencilId: 'pool.freeform-kidney', label: 'Kidney' },
]

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
      <DropdownMenuContent align="center" side="top" className="w-44">
        {POOL_SHAPES.map((shape) => (
          <DropdownMenuItem key={shape.stencilId} onSelect={() => pick(shape.stencilId)}>
            {shape.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
