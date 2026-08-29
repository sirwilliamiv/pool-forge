'use client'

import { Grid3x3, Magnet } from 'lucide-react'

import { dispatch } from '@/lib/commands/dispatch'
import { GRID_SPACINGS } from '@/lib/geometry/drawing'
import { cn } from '@/lib/utils'
import { useDrawStore } from '@/modules/editor/state/drawStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'

/**
 * Grid size, snapping, and whether the grid is drawn at all.
 *
 * In the toolbar next to the drawing tools rather than buried in a panel,
 * because grid size is not a setting you choose once. It changes with the task:
 * five feet to place a pool on a lot, three inches to detail a coping course.
 * A control you have to go and find is one people stop using.
 */
export function GridControl() {
  const spacing = useDrawStore(s => s.gridSpacing)
  const snapEnabled = useDrawStore(s => s.snapEnabled)
  const gridVisible = useEditorStore(s => s.gridVisible)
  const toggleGrid = useEditorStore(s => s.toggleGrid)

  return (
    <div className="flex items-center gap-0.5">
      <label className="sr-only" htmlFor="grid-spacing">
        Grid size
      </label>
      <select
        id="grid-spacing"
        value={spacing}
        onChange={event => {
          void dispatch('grid.set', { spacing: event.target.value })
        }}
        className="h-8 rounded-pfSm border border-border bg-white px-2 text-[12px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent"
        title="Grid size"
      >
        {GRID_SPACINGS.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => void dispatch('grid.snap.toggle', {})}
        aria-pressed={snapEnabled}
        title={snapEnabled ? 'Snapping on. Hold Alt to step off the grid.' : 'Snapping off'}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-pfSm transition-colors',
          snapEnabled ? 'bg-foreground text-white' : 'text-textMuted hover:bg-rowHover',
        )}
      >
        <Magnet className="h-4 w-4" aria-hidden />
        <span className="sr-only">Snap to grid</span>
      </button>

      <button
        type="button"
        onClick={() => toggleGrid()}
        aria-pressed={gridVisible}
        title={gridVisible ? 'Hide the grid' : 'Show the grid'}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-pfSm transition-colors',
          gridVisible ? 'bg-rowHover text-foreground' : 'text-textMuted hover:bg-rowHover',
        )}
      >
        <Grid3x3 className="h-4 w-4" aria-hidden />
        <span className="sr-only">Show grid</span>
      </button>
    </div>
  )
}
