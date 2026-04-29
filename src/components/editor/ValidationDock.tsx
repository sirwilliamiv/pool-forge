'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useShapesStore } from '@/modules/editor/state'
import { computeMeasurements } from '@/modules/measurements/engine'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationItem,
  ValidationLevel,
} from '@/modules/validation/types'

const DEFAULT_SELECTIONS: ValidationContext['selections'] = {
  heaterSelected: false,
  saltSelected: false,
  screenSelected: false,
  lightingQuantity: 0,
}

const PASS_CAP = 5

interface ValidationDockProps {
  project: ValidationContext['project']
}

export function ValidationDock({ project }: ValidationDockProps) {
  const shapes = useShapesStore((s) => s.shapes)
  const [open, setOpen] = useState(false)

  const report = useMemo(() => {
    const measurements = computeMeasurements(shapes)
    return runValidation({
      project,
      measurements,
      selections: DEFAULT_SELECTIONS,
      shapeCount: shapes.length,
      hasDeck: measurements.hasDeck,
    })
  }, [shapes, project])

  const { items, counts } = report
  const pillTone =
    counts.error > 0
      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
      : counts.warn > 0
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'

  return (
    <div className="w-full">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-8 w-full justify-between gap-2 px-3 text-xs font-medium',
          pillTone,
        )}
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold">{counts.error}</span> errors
          <span aria-hidden>·</span>
          <span className="font-semibold">{counts.warn}</span> warn
          <span aria-hidden>·</span>
          <span className="font-semibold">{counts.pass}</span> ok
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {open && (
        <Card className="mt-1 max-h-[60vh] overflow-y-auto p-2 text-xs shadow-lg">
          <ItemSection level="error" items={items} />
          <ItemSection level="warn" items={items} />
          <ItemSection level="pass" items={items} cap={PASS_CAP} />
        </Card>
      )}
    </div>
  )
}

interface ItemSectionProps {
  level: ValidationLevel
  items: ValidationItem[]
  cap?: number
}

function ItemSection({ level, items, cap }: ItemSectionProps) {
  const matching = items.filter((i) => i.level === level)
  if (matching.length === 0) return null

  const visible = cap ? matching.slice(0, cap) : matching
  const hidden = cap ? Math.max(0, matching.length - cap) : 0

  return (
    <div className="py-1">
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {level === 'error' ? 'Errors' : level === 'warn' ? 'Warnings' : 'Passing'}
      </div>
      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded px-1 py-1">
            <LevelIcon level={item.level} />
            <div className="min-w-0 flex-1">
              <div className="leading-snug">{item.message}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.category}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="px-1 pt-1 text-[10px] text-muted-foreground">+{hidden} more</div>
      )}
      {(level === 'error' || level === 'warn') && (cap ? false : matching.length > 0) && (
        <Separator className="mt-2" />
      )}
    </div>
  )
}

function LevelIcon({ level }: { level: ValidationLevel }) {
  if (level === 'error')
    return <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
  if (level === 'warn')
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
  return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
}
