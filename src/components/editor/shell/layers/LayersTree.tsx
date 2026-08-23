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
      // "Drop a stencil" described drag and drop, which is not how this works,
      // and used two words a new starter has not been given. This says what to
      // click, in the words printed on the thing to click.
      <p className="px-3 py-2 text-[11.5px] leading-relaxed text-textFaint">
        Nothing drawn yet. Open the <span className="font-medium text-textMuted">Commands</span>{' '}
        button at the bottom of the canvas (or press ⌘K) and pick something under
        “Add”, or choose a pool shape from the toolbar and click the canvas.
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
