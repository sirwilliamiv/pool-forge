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

      {/* One row, not three things pinned to the same edge and hoping.
          Absolutely positioned, the centred toolbar and the right-hand
          checklist ran into each other as soon as either grew or the window
          narrowed. As a wrapping row they share the space: while everything
          fits, the toolbar sits between the sun dial and the checklist, and
          when it does not, the checklist lifts onto its own line above rather
          than sitting on top of the tools. `flex-wrap-reverse` is what makes
          the overflow line go up instead of off the bottom of the canvas. The
          wrappers keep the empty space click-through so the canvas underneath
          is still reachable. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap-reverse items-end justify-center gap-3">
        <div className="pointer-events-auto mr-auto">
          {sunDialSlot ?? <Placeholder label="Sun study" muted />}
        </div>

        <div className="pointer-events-auto">
          {toolbarSlot ?? <Placeholder label="Toolbar" muted />}
        </div>

        <div className="pointer-events-auto ml-auto">
          {validationDockSlot ?? <Placeholder label="Validation" muted />}
        </div>
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
