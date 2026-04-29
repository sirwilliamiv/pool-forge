'use client'

import {
  MousePointer2,
  Hand,
  Square,
  Move,
  RotateCw,
  AlignCenter,
  Layers,
  Lock,
  Type,
  Ruler,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

interface ToolButtonProps {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}

function ToolButton({ label, icon: Icon, active, onClick }: ToolButtonProps) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-10 w-10"
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function LeftToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const addShape = useShapesStore((s) => s.addShape)
  const select = useSelectionStore((s) => s.select)

  function pickTool(id: string) {
    setActiveTool(id)
  }

  function quickAddPool() {
    setActiveTool('tool.select')
    const id = addShape('rectangle-pool', 100, 100)
    select(id)
  }

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r bg-background py-2">
      <ToolButton
        label="Select (V)"
        icon={MousePointer2}
        active={activeTool === 'tool.select'}
        onClick={() => pickTool('tool.select')}
      />
      <ToolButton
        label="Pan (H)"
        icon={Hand}
        active={activeTool === 'tool.pan'}
        onClick={() => pickTool('tool.pan')}
      />

      <Separator className="my-1" />

      <ToolButton
        label="Add rectangle pool (P)"
        icon={Square}
        active={false}
        onClick={quickAddPool}
      />
      <ToolButton
        label="Move"
        icon={Move}
        active={activeTool === 'tool.move'}
        onClick={() => pickTool('tool.move')}
      />
      <ToolButton
        label="Rotate"
        icon={RotateCw}
        active={activeTool === 'tool.rotate'}
        onClick={() => pickTool('tool.rotate')}
      />
      <ToolButton
        label="Align"
        icon={AlignCenter}
        active={activeTool === 'tool.align'}
        onClick={() => pickTool('tool.align')}
      />

      <Separator className="my-1" />

      <ToolButton
        label="Measure"
        icon={Ruler}
        active={activeTool === 'tool.measure'}
        onClick={() => pickTool('tool.measure')}
      />
      <ToolButton
        label="Add label"
        icon={Type}
        active={activeTool === 'tool.label'}
        onClick={() => pickTool('tool.label')}
      />
      <ToolButton
        label="Layers"
        icon={Layers}
        active={activeTool === 'tool.layers'}
        onClick={() => pickTool('tool.layers')}
      />
      <ToolButton
        label="Lock"
        icon={Lock}
        active={activeTool === 'tool.lock'}
        onClick={() => pickTool('tool.lock')}
      />
    </div>
  )
}
