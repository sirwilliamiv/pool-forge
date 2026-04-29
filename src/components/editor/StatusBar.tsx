'use client'

import { useSelectionStore, useEditorStore } from '@/modules/editor/state'

export function StatusBar() {
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const activeTool = useEditorStore((s) => s.activeTool)
  const zoom = useEditorStore((s) => s.zoom)

  return (
    <div className="flex h-7 items-center justify-between border-t bg-background px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>{selectedIds.length === 0 ? 'No selection' : `${selectedIds.length} selected`}</span>
        <span className="font-mono">{activeTool}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>zoom {Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}
