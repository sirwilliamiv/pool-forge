'use client'

import { useMemo } from 'react'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { LayerRow } from './LayerRow'

export function LayersTree() {
  const shapes = useShapesStore((s) => s.shapes)
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Render in z-order top-down (highest zIndex first → topmost layer on top of list).
  const ordered = useMemo(
    () => [...shapes].sort((a, b) => b.zIndex - a.zIndex),
    [shapes],
  )

  if (ordered.length === 0) {
    return (
      <p className="px-3 py-2 text-[11.5px] text-textFaint">
        No layers yet. Drop a stencil or use ⌘K → Add to start.
      </p>
    )
  }

  return (
    <div className="space-y-px px-1">
      {ordered.map((shape) => (
        <LayerRow
          key={shape.id}
          shape={shape}
          selected={selectedSet.has(shape.id)}
        />
      ))}
    </div>
  )
}
