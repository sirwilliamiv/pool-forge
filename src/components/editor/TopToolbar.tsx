'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useEditorStore, useHistoryStore } from '@/modules/editor/state'

export function TopToolbar() {
  const zoom = useEditorStore((s) => s.zoom)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const fitToPage = useEditorStore((s) => s.fitToPage)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const toggleSnap = useEditorStore((s) => s.toggleSnap)
  const toggleQuotePanel = useEditorStore((s) => s.toggleQuotePanel)

  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)
  const canUndo = useHistoryStore((s) => s.canUndo)
  const canRedo = useHistoryStore((s) => s.canRedo)

  return (
    <div className="flex h-10 items-center gap-1 border-b bg-background px-2">
      <Button variant="ghost" size="sm" onClick={() => undo()} disabled={!canUndo()}>
        Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={() => redo()} disabled={!canRedo()}>
        Redo
      </Button>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button variant="ghost" size="sm" onClick={zoomOut}>
        −
      </Button>
      <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="ghost" size="sm" onClick={zoomIn}>
        +
      </Button>
      <Button variant="ghost" size="sm" onClick={fitToPage}>
        Fit
      </Button>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button variant={gridVisible ? 'secondary' : 'ghost'} size="sm" onClick={toggleGrid}>
        Grid
      </Button>
      <Button variant={snapEnabled ? 'secondary' : 'ghost'} size="sm" onClick={toggleSnap}>
        Snap
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={toggleQuotePanel}>
          Quote
        </Button>
        <Button size="sm">Export</Button>
      </div>
    </div>
  )
}
