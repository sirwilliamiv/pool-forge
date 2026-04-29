'use client'

import Link from 'next/link'
import { Trash2, ZoomIn, ZoomOut, Maximize2, FileText, Wrench, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

interface TopToolbarProps {
  projectId?: string
  projectName?: string
}

export function TopToolbar({ projectId, projectName = 'Untitled' }: TopToolbarProps) {
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

  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const clearSelection = useSelectionStore((s) => s.clear)
  const removeShapes = useShapesStore((s) => s.removeShapes)

  function deleteSelected() {
    if (selectedIds.length === 0) return
    removeShapes(selectedIds)
    clearSelection()
  }

  return (
    <div className="flex h-12 items-center gap-1 border-b bg-background px-3">
      <div className="mr-2 truncate text-sm font-semibold">{projectName}</div>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button variant="ghost" size="sm" onClick={() => undo()} disabled={!canUndo()}>
        Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={() => redo()} disabled={!canRedo()}>
        Redo
      </Button>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button variant="ghost" size="icon" onClick={zoomOut} title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="ghost" size="icon" onClick={zoomIn} title="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={fitToPage} title="Fit">
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button variant={gridVisible ? 'secondary' : 'ghost'} size="sm" onClick={toggleGrid}>
        Grid
      </Button>
      <Button variant={snapEnabled ? 'secondary' : 'ghost'} size="sm" onClick={toggleSnap}>
        Snap
      </Button>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Button
        variant="ghost"
        size="sm"
        onClick={deleteSelected}
        disabled={selectedIds.length === 0}
        title="Delete selected"
      >
        <Trash2 className="mr-1 h-4 w-4" />
        Delete
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Auto-saved</span>
        <Button variant="outline" size="sm" onClick={toggleQuotePanel}>
          Quote
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={!projectId}>
              Export
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link
                href={projectId ? `/projects/${projectId}/proposal` : '#'}
                target="_blank"
                rel="noopener"
              >
                <FileText className="mr-2 h-4 w-4" />
                Customer proposal
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={projectId ? `/projects/${projectId}/construction` : '#'}
                target="_blank"
                rel="noopener"
              >
                <Wrench className="mr-2 h-4 w-4" />
                Construction packet
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
