'use client'

import { Maximize } from 'lucide-react'

import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import { useCameraStore } from '@/modules/editor/state/cameraStore'

type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

const FACES: { view: CameraView; label: string; className: string }[] = [
  { view: 'top', label: 'TOP', className: 'col-start-2 row-start-1' },
  { view: 'left', label: 'LEFT', className: 'col-start-1 row-start-2' },
  { view: 'iso', label: 'ISO', className: 'col-start-2 row-start-2' },
  { view: 'right', label: 'RIGHT', className: 'col-start-3 row-start-2' },
  { view: 'front', label: 'FRONT', className: 'col-start-2 row-start-3' },
]

export function ViewCube() {
  const targetView = useCameraStore((s) => s.targetView)

  function snap(view: CameraView) {
    void dispatch('camera.set.view', { view })
  }

  return (
    <div className="pointer-events-auto flex flex-col items-stretch gap-1">
      {/* Fit to page. There was no control for this at all, so an object staged
          off to the side of the drawing could only be found by panning for it. */}
      <button
        type="button"
        onClick={() => void dispatch('canvas.fit', {})}
        title="Fit everything in view"
        aria-label="Fit everything in view"
        className="flex h-7 items-center justify-center gap-1 rounded-pfMd border border-border bg-white text-[9px] font-semibold uppercase tracking-wide text-textMuted shadow-pfMd transition hover:bg-rowHover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent"
      >
        <Maximize className="h-3 w-3" aria-hidden />
        Fit
      </button>

      <div
        className="h-24 w-24 rounded-pfMd border border-border bg-white p-1 shadow-pfMd"
        role="group"
        aria-label="View cube"
      >
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-0.5">
        {FACES.map(({ view, label, className }) => {
          const active = targetView === view
          return (
            <button
              key={view}
              type="button"
              onClick={() => snap(view)}
              className={cn(
                'flex items-center justify-center rounded-pfXs border border-transparent text-[9px] font-semibold uppercase tracking-wide text-textMuted transition hover:border-border hover:bg-rowHover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent',
                active && 'bg-pfAccentSoft font-bold text-pfAccentStrong',
                className,
              )}
              aria-label={`Snap camera to ${label.toLowerCase()} view`}
              aria-pressed={active}
            >
              {label}
            </button>
          )
        })}
        </div>
      </div>
    </div>
  )
}
