'use client'

import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import { useViewStore } from '@/modules/editor/state/viewStore'

type Mode = 'plan' | 'design' | 'build' | 'customer'

const MODES: { id: Mode; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'customer', label: 'Customer' },
]

export function ModePillContainer() {
  const presentationMode = useViewStore((s) => s.presentationMode)
  const setPresentationMode = useViewStore((s) => s.setPresentationMode)

  function pick(mode: Mode) {
    setPresentationMode(mode)
    void dispatch('mode.set.presentation', { mode })
  }

  return (
    <div
      className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border bg-white p-0.5 shadow-pfMd"
      role="radiogroup"
      aria-label="Presentation mode"
    >
      {MODES.map(({ id, label }) => {
        const active = presentationMode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-pfAccent',
              active
                ? 'bg-foreground text-white'
                : 'text-textMuted hover:bg-rowHover hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
