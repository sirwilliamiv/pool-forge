'use client'

import type { ReactNode } from 'react'

export interface CanvasOverlayProps {
  modePillSlot?: ReactNode
  quoteDockSlot?: ReactNode
  viewCubeSlot?: ReactNode
  sunDialSlot?: ReactNode
  toolbarSlot?: ReactNode
  validationDockSlot?: ReactNode
  selectionLabelSlot?: ReactNode
  contextualToolbarSlot?: ReactNode
  multiplayerCursorSlot?: ReactNode
}

export function CanvasOverlay({
  modePillSlot,
  quoteDockSlot,
  viewCubeSlot,
  sunDialSlot,
  toolbarSlot,
  validationDockSlot,
  selectionLabelSlot,
  contextualToolbarSlot,
  multiplayerCursorSlot,
}: CanvasOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2">
        {modePillSlot ?? <Placeholder label="Mode pill" muted />}
      </div>

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="pointer-events-auto">
          {quoteDockSlot ?? <Placeholder label="Live quote" muted />}
        </div>
        <div className="pointer-events-auto">
          {viewCubeSlot ?? <Placeholder label="View cube" muted />}
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-3">
        {sunDialSlot ?? <Placeholder label="Sun study" muted />}
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2">
        {toolbarSlot ?? <Placeholder label="Toolbar" muted />}
      </div>

      <div className="pointer-events-auto absolute bottom-3 right-3">
        {validationDockSlot ?? <Placeholder label="Validation" muted />}
      </div>

      {/* Re-projected from 3D each frame; positioning is owned by the slot itself. */}
      {selectionLabelSlot}
      {contextualToolbarSlot}
      {multiplayerCursorSlot}
    </div>
  )
}

function Placeholder({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div
      className={
        'rounded-pfMd border border-borderLight bg-white/90 px-3 py-1.5 text-[11px] shadow-pfSm backdrop-blur ' +
        (muted ? 'text-textFaint' : 'text-textMuted')
      }
    >
      {label} — pending
    </div>
  )
}
