'use client'
import { ShapeKind } from '@prisma/client'

// Konva-using inner canvas. Loaded only on client (ssr:false) by CanvasStage.
//
// Coordinate convention:
// - Shape state stores positions and dimensions in INCHES.
// - Render-time we multiply by PIXELS_PER_INCH to draw on the Konva stage.
// - The user-controlled `zoom` is then applied as Stage scaleX/scaleY on top.

import { useEffect, useMemo, useRef } from 'react'
import {
  Stage,
  Layer,
  Rect,
  Line,
  Transformer,
  Group,
  Text,
} from 'react-konva'
import type Konva from 'konva'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import type { Shape } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { SurveyLayer } from './SurveyLayer'

const PIXELS_PER_INCH = 2 // 25 ft pool == 600 px (before user zoom)
const STAGE_W = 1200
const STAGE_H = 800
const GRID_INCHES = 12 // grid line every foot

function fillForShape(shape: Shape): { fill: string; stroke: string; dash?: number[] } {
  if (shape.kind === ShapeKind.STENCIL) {
    const def = getStencil(shape.stencilId)
    if (def) return { fill: def.defaultFill, stroke: def.defaultStroke }
  }
  switch (shape.kind) {
    case ShapeKind.RECTANGLE_POOL:
      return { fill: '#3b82f6', stroke: '#1e3a8a' }
    case ShapeKind.CONCRETE_DECK:
      return { fill: '#cbd5e1', stroke: '#64748b' }
    case ShapeKind.PAVER_DECK:
      return { fill: '#a78bfa', stroke: '#5b21b6' }
    case ShapeKind.GRASS_AREA:
      return { fill: '#86efac', stroke: '#166534' }
    case ShapeKind.SUN_SHELF:
      return { fill: '#93c5fd', stroke: '#1d4ed8' }
    case ShapeKind.BENCH:
      return { fill: '#d6a772', stroke: '#7c4a1d' }
    case ShapeKind.SPA:
      return { fill: '#1d4ed8', stroke: '#172554', dash: [8, 6] }
    case ShapeKind.STENCIL:
      return { fill: '#e5e7eb', stroke: '#374151' }
  }
}

export default function CanvasStageInner() {
  const shapes = useShapesStore((s) => s.shapes)
  const updateShape = useShapesStore((s) => s.updateShape)
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const select = useSelectionStore((s) => s.select)
  const toggle = useSelectionStore((s) => s.toggle)
  const clear = useSelectionStore((s) => s.clear)
  const zoom = useEditorStore((s) => s.zoom)
  const panX = useEditorStore((s) => s.panX)
  const panY = useEditorStore((s) => s.panY)
  const gridVisible = useEditorStore((s) => s.gridVisible)

  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const nodeRefs = useRef<Map<string, Konva.Rect>>(new Map())

  // Sort by zIndex for stable paint order.
  const sortedShapes = useMemo(
    () => [...shapes].sort((a, b) => a.zIndex - b.zIndex),
    [shapes],
  )

  // Sync transformer with selection.
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Rect => Boolean(n))
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, shapes])

  // Grid lines (in stage-pixel units, drawn under the zoom).
  const gridLines = useMemo(() => {
    if (!gridVisible) return null
    const step = GRID_INCHES * PIXELS_PER_INCH
    const lines: React.ReactElement[] = []
    for (let x = 0; x <= STAGE_W; x += step) {
      lines.push(
        <Line
          key={`gx-${x}`}
          points={[x, 0, x, STAGE_H]}
          stroke="#e2e8f0"
          strokeWidth={x % (step * 5) === 0 ? 1 : 0.5}
          listening={false}
        />,
      )
    }
    for (let y = 0; y <= STAGE_H; y += step) {
      lines.push(
        <Line
          key={`gy-${y}`}
          points={[0, y, STAGE_W, y]}
          stroke="#e2e8f0"
          strokeWidth={y % (step * 5) === 0 ? 1 : 0.5}
          listening={false}
        />,
      )
    }
    return lines
  }, [gridVisible])

  function handleStageMouseDown(e: Konva.KonvaEventObject<Event>) {
    if (e.target === e.target.getStage()) {
      clear()
    }
  }

  function handleShapeClick(
    id: string,
    e: Konva.KonvaEventObject<Event>,
  ) {
    e.cancelBubble = true
    const native = e.evt as MouseEvent
    if (native.shiftKey) {
      toggle(id)
    } else {
      select(id)
    }
  }

  return (
    <div className="relative h-full w-full overflow-auto bg-muted/30">
      <Stage
        ref={stageRef}
        width={STAGE_W}
        height={STAGE_H}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        onMouseDown={handleStageMouseDown}
        onTouchStart={handleStageMouseDown}
        style={{ background: 'white' }}
      >
        <Layer listening={false}>{gridLines}</Layer>

        <Layer>
          <SurveyLayer />
        </Layer>

        <Layer>
          {sortedShapes.map((shape) => {
            const palette = fillForShape(shape)
            const isSelected = selectedIds.includes(shape.id)
            return (
              <Group
                key={shape.id}
                listening={!shape.locked && !shape.hidden}
                visible={!shape.hidden}
              >
                <Rect
                  ref={(node) => {
                    if (node) nodeRefs.current.set(shape.id, node)
                    else nodeRefs.current.delete(shape.id)
                  }}
                  x={shape.x * PIXELS_PER_INCH}
                  y={shape.y * PIXELS_PER_INCH}
                  width={shape.width * PIXELS_PER_INCH}
                  height={shape.height * PIXELS_PER_INCH}
                  rotation={shape.rotation}
                  fill={palette.fill}
                  stroke={isSelected ? '#0ea5e9' : palette.stroke}
                  strokeWidth={isSelected ? 3 : 1.5}
                  {...(palette.dash ? { dash: palette.dash } : {})}
                  draggable={!shape.locked}
                  onClick={(e) => handleShapeClick(shape.id, e)}
                  onTap={(e) => handleShapeClick(shape.id, e)}
                  onDragEnd={(e) => {
                    const node = e.target
                    updateShape(shape.id, {
                      x: node.x() / PIXELS_PER_INCH,
                      y: node.y() / PIXELS_PER_INCH,
                    })
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Rect
                    const scaleX = node.scaleX()
                    const scaleY = node.scaleY()
                    const newWidthPx = Math.max(8, node.width() * scaleX)
                    const newHeightPx = Math.max(8, node.height() * scaleY)
                    node.scaleX(1)
                    node.scaleY(1)
                    updateShape(shape.id, {
                      x: node.x() / PIXELS_PER_INCH,
                      y: node.y() / PIXELS_PER_INCH,
                      width: newWidthPx / PIXELS_PER_INCH,
                      height: newHeightPx / PIXELS_PER_INCH,
                      rotation: node.rotation(),
                    })
                  }}
                />
              </Group>
            )
          })}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio={false}
            borderStroke="#0ea5e9"
            anchorStroke="#0ea5e9"
            anchorFill="#ffffff"
            anchorSize={8}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 8 || newBox.height < 8) return oldBox
              return newBox
            }}
          />
        </Layer>

        <Layer listening={false}>
          <Text
            x={8}
            y={8}
            text="1 sq = 1 ft"
            fontSize={11}
            fill="#94a3b8"
          />
        </Layer>
      </Stage>
    </div>
  )
}
