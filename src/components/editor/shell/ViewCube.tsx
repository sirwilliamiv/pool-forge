'use client'

import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'

type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

const FACES: { view: CameraView; label: string; className: string }[] = [
  { view: 'top', label: 'TOP', className: 'col-start-2 row-start-1' },
  { view: 'left', label: 'LEFT', className: 'col-start-1 row-start-2' },
  { view: 'iso', label: 'ISO', className: 'col-start-2 row-start-2' },
  { view: 'right', label: 'RIGHT', className: 'col-start-3 row-start-2' },
  { view: 'front', label: 'FRONT', className: 'col-start-2 row-start-3' },
]

export function ViewCube() {
  function snap(view: CameraView) {
    void dispatch('camera.set.view', { view })
  }

  return (
    <div
      className="pointer-events-auto h-24 w-24 rounded-pfMd border border-border bg-white p-1 shadow-pfMd"
      role="group"
      aria-label="View cube"
    >
      <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-0.5">
        {FACES.map(({ view, label, className }) => (
          <button
            key={view}
            type="button"
            onClick={() => snap(view)}
            className={cn(
              'flex items-center justify-center rounded-pfXs border border-transparent text-[9px] font-semibold uppercase tracking-wide text-textMuted transition hover:border-border hover:bg-rowHover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent',
              view === 'iso' && 'bg-rowActive font-bold text-pfAccentStrong',
              className,
            )}
            aria-label={`Snap camera to ${label.toLowerCase()} view`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
