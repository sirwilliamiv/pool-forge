'use client'

import {
  Copy,
  Palette,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useScreenSelectionStore } from '@/modules/editor/state/screenSelectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useViewStore } from '@/modules/editor/state/viewStore'
import { dispatch } from '@/lib/commands/dispatch'

const LABEL_HEIGHT = 24
const TOOLBAR_GAP = 8

interface ToolbarButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-pfXs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}

export function ContextualToolbar() {
  const { x, y, visible } = useScreenSelectionStore()
  const firstId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => s.shapes.find((sh) => sh.id === firstId))
  const setLeftTab = useViewStore((s) => s.setLeftTab)

  if (!visible || !firstId || !shape) return null

  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-0.5 rounded-pfMd bg-slate-900/95 px-1 py-1 shadow-pfLg"
      style={{
        left: x,
        top: y - LABEL_HEIGHT - TOOLBAR_GAP,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <ToolbarButton
        label="Duplicate"
        onClick={() => void dispatch('duplicate.shape', { id: firstId })}
      >
        <Copy className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Swap material" onClick={() => setLeftTab('materials')}>
        <Palette className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="mx-1 h-4 w-px bg-white/15" />
      <ToolbarButton
        label={shape.locked ? 'Unlock' : 'Lock'}
        onClick={() =>
          void dispatch('shape.lock', { id: firstId, locked: !shape.locked })
        }
      >
        {shape.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      </ToolbarButton>
      <ToolbarButton
        label={shape.hidden ? 'Show' : 'Hide'}
        onClick={() =>
          void dispatch('shape.hide', { id: firstId, hidden: !shape.hidden })
        }
      >
        {shape.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </ToolbarButton>
      <ToolbarButton
        label="Delete"
        onClick={() => void dispatch('delete.shape', { ids: [firstId] })}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  )
}
