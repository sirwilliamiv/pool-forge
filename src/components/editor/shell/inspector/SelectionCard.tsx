'use client'

import { useState, useEffect } from 'react'
import { useSelectionStore, useShapesStore, isPool, isFeature, isDeck } from '@/modules/editor/state'
import { dispatch } from '@/lib/commands/dispatch'
import { Box, Square, Waves } from 'lucide-react'

function metaFor(shape: ReturnType<typeof useShapesStore.getState>['shapes'][number]): string {
  if (isPool(shape)) {
    const lengthFt = (shape.width / 12).toFixed(1)
    const widthFt = (shape.height / 12).toFixed(1)
    const avg = ((shape.depthShallow + shape.depthDeep) / 2).toFixed(1)
    return `${lengthFt}' × ${widthFt}' · avg ${avg}' deep`
  }
  if (isFeature(shape)) return `${shape.kind.toLowerCase().replace('_', ' ')} · 1 of 1`
  if (isDeck(shape)) {
    const sqft = ((shape.width * shape.height) / 144).toFixed(0)
    return `${sqft} sq ft`
  }
  return shape.kind.toLowerCase().replace('_', ' ')
}

function iconFor(kind: string) {
  if (kind === 'RECTANGLE_POOL') return Waves
  if (kind === 'SPA' || kind === 'SUN_SHELF' || kind === 'BENCH') return Box
  return Square
}

export function SelectionCard() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => s.shapes.find((x) => x.id === selectedId))
  const [name, setName] = useState('')

  useEffect(() => {
    setName(shape ? shape.kind.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '')
  }, [shape?.id, shape?.kind])

  if (!shape) {
    return (
      <div className="flex h-[60px] items-center justify-center bg-gradient-to-b from-pfAccentSoft to-white px-3 text-[11.5px] text-textMuted">
        Nothing selected
      </div>
    )
  }

  const Icon = iconFor(shape.kind)

  function commitName() {
    if (!shape || name === shape.kind) return
    // TODO: register shape.rename in Track G; until then this is a no-op dispatch the audit log will reject.
    void dispatch('shape.rename', { id: shape.id, name })
  }

  return (
    <div className="flex h-[60px] items-center gap-3 bg-gradient-to-b from-pfAccentSoft to-white px-3">
      <div className="grid h-8 w-8 place-items-center rounded-pfSm bg-white shadow-pfXs">
        <Icon className="h-4 w-4 text-pfAccentStrong" />
      </div>
      <div className="min-w-0 flex-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-full bg-transparent text-[12px] font-medium leading-tight text-foreground outline-none focus:ring-1 focus:ring-pfAccent"
        />
        <div className="mt-0.5 truncate text-[11px] text-textMuted">{metaFor(shape)}</div>
      </div>
    </div>
  )
}
