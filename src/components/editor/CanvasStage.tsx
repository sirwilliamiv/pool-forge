'use client'

import dynamic from 'next/dynamic'
import { useEditorStore } from '@/modules/editor/state'

const Stage = dynamic(() => import('react-konva').then((m) => m.Stage), { ssr: false })
const Layer = dynamic(() => import('react-konva').then((m) => m.Layer), { ssr: false })

interface CanvasStageProps {
  width?: number
  height?: number
}

export function CanvasStage({ width = 1024, height = 720 }: CanvasStageProps) {
  const zoom = useEditorStore((s) => s.zoom)
  const panX = useEditorStore((s) => s.panX)
  const panY = useEditorStore((s) => s.panY)

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/30">
      <Stage width={width} height={height} scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
        <Layer />
      </Stage>
    </div>
  )
}
