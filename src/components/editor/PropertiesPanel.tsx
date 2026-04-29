'use client'

import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import {
  isPool,
  SHAPE_DEFAULTS,
  useSelectionStore,
  useShapesStore,
  type Shape,
} from '@/modules/editor/state'
import { resizeToTargetArea, rectangleAreaSqft } from '@/lib/geometry/rectangle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const IN_PER_FT = 12

function toFt(inches: number): number {
  return Math.round((inches / IN_PER_FT) * 100) / 100
}
function toIn(feet: number): number {
  return feet * IN_PER_FT
}

export function PropertiesPanel() {
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const clearSelection = useSelectionStore((s) => s.clear)
  const shapes = useShapesStore((s) => s.shapes)
  const updateShape = useShapesStore((s) => s.updateShape)
  const removeShape = useShapesStore((s) => s.removeShape)

  const selectedId = selectedIds[0]
  const shape = useMemo(
    () => (selectedId ? shapes.find((s) => s.id === selectedId) : undefined),
    [selectedId, shapes],
  )

  if (!shape) {
    return (
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l bg-background">
        <PanelHeader title="Properties" />
        <div className="flex-1 p-3">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Select a shape to edit its properties.
            </CardContent>
          </Card>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l bg-background">
      <PanelHeader title="Properties" />
      <div className="flex-1 space-y-3 p-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="truncate text-sm">{SHAPE_DEFAULTS[shape.kind].label}</CardTitle>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {shape.kind}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldGrid label="Dimensions (ft)">
              <NumField
                label="W"
                value={toFt(shape.width)}
                onCommit={(v) => updateShape(shape.id, { width: toIn(v) })}
              />
              <NumField
                label="H"
                value={toFt(shape.height)}
                onCommit={(v) => updateShape(shape.id, { height: toIn(v) })}
              />
            </FieldGrid>

            <FieldGrid label="Position (ft)">
              <NumField
                label="X"
                value={toFt(shape.x)}
                onCommit={(v) => updateShape(shape.id, { x: toIn(v) })}
              />
              <NumField
                label="Y"
                value={toFt(shape.y)}
                onCommit={(v) => updateShape(shape.id, { y: toIn(v) })}
              />
            </FieldGrid>

            <FieldGrid label="Rotation (°)">
              <NumField
                label="θ"
                value={Math.round(shape.rotation)}
                onCommit={(v) => updateShape(shape.id, { rotation: ((v % 360) + 360) % 360 })}
                min={0}
                max={360}
              />
            </FieldGrid>

            {isPool(shape) && (
              <>
                <Separator />
                <FieldGrid label="Depth (ft)">
                  <NumField
                    label="Shallow"
                    value={shape.depthShallow}
                    onCommit={(v) => updateShape(shape.id, { depthShallow: v })}
                    step={0.5}
                  />
                  <NumField
                    label="Deep"
                    value={shape.depthDeep}
                    onCommit={(v) => updateShape(shape.id, { depthDeep: v })}
                    step={0.5}
                  />
                </FieldGrid>
                <TargetAreaForm shape={shape} />
              </>
            )}
          </CardContent>
        </Card>

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => {
            removeShape(shape.id)
            clearSelection()
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete shape
        </Button>
      </div>
    </aside>
  )
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </div>
  )
}

function FieldGrid({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

interface NumFieldProps {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
}

function NumField({ label, value, onCommit, min, max, step = 0.1 }: NumFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        defaultValue={value}
        key={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        className="h-8 text-sm"
        onBlur={(e) => {
          const n = Number(e.currentTarget.value)
          if (!Number.isFinite(n)) return
          onCommit(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

function TargetAreaForm({ shape }: { shape: Shape }) {
  const updateShape = useShapesStore((s) => s.updateShape)
  const currentArea = rectangleAreaSqft(shape.width, shape.height)
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Resize to target area
      </p>
      <p className="text-[10px] text-muted-foreground">
        Current: {currentArea.toFixed(1)} sqft
      </p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const target = Number(fd.get('targetArea'))
          if (!Number.isFinite(target) || target <= 0) return
          const { widthInches, heightInches } = resizeToTargetArea(
            shape.width,
            shape.height,
            target,
          )
          updateShape(shape.id, { width: widthInches, height: heightInches })
        }}
      >
        <div className="flex-1 space-y-1">
          <Label className="text-[10px] text-muted-foreground">Target sqft</Label>
          <Input
            name="targetArea"
            type="number"
            step="1"
            min="1"
            defaultValue={Math.round(currentArea)}
            className="h-8 text-sm"
          />
        </div>
        <Button type="submit" size="sm" className="h-8">
          Resize
        </Button>
      </form>
    </div>
  )
}
