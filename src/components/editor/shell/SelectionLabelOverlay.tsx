'use client'

import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useScreenSelectionStore } from '@/modules/editor/state/screenSelectionStore'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'
import { getStencil } from '@/modules/editor/stencils'

function labelFor(shape: Shape | undefined): string {
  if (!shape) return 'Selection'
  switch (shape.kind) {
    case ShapeKind.RECTANGLE_POOL:
      return 'Pool — Rectangle'
    case ShapeKind.CONCRETE_DECK:
      return 'Concrete deck'
    case ShapeKind.PAVER_DECK:
      return 'Paver deck'
    case ShapeKind.GRASS_AREA:
      return 'Grass area'
    case ShapeKind.SUN_SHELF:
      return 'Sun shelf'
    case ShapeKind.BENCH:
      return 'Bench'
    case ShapeKind.SPA:
      return 'Spa'
    case ShapeKind.STENCIL: {
      const s = getStencil(shape.stencilId)
      return s?.name ?? 'Stencil'
    }
  }
}

export function SelectionLabelOverlay() {
  const { x, y, visible } = useScreenSelectionStore()
  const firstId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => (firstId ? s.shapes.find((sh) => sh.id === firstId) : undefined))
  const flags = usePresentationFlags()

  if (!flags.showSelectionChrome) return null
  if (!visible || !firstId) return null

  return (
    <div
      className="pointer-events-auto absolute select-none rounded-pfSm bg-pfAccent px-2 py-1 text-[11px] font-medium text-white shadow-pfSm"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {labelFor(shape)}
    </div>
  )
}
