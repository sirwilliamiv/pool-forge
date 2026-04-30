'use client'

import { useSelectionStore } from '@/modules/editor/state'
import { dispatch } from '@/lib/commands/dispatch'
import { ChevronDown, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState } from 'react'

type Slot = 'interior' | 'coping' | 'tileBand'

interface MaterialOption {
  id: string
  name: string
  meta: string
  cost: string
  swatch: string // CSS background
}

// TODO: replace with real prisma.Material loader (server prop or server action).
const PLACEHOLDER_OPTIONS: Record<Slot, MaterialOption[]> = {
  interior: [
    {
      id: 'pebbletec-blue-granite',
      name: 'PebbleTec — Blue Granite',
      meta: 'Premium · 1,225 sq ft wetted',
      cost: '$11,025',
      swatch: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%)',
    },
    {
      id: 'pebbletec-cobalt',
      name: 'PebbleTec — Cobalt',
      meta: 'Premium',
      cost: '$8,725',
      swatch: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    },
    {
      id: 'plaster-white',
      name: 'White Plaster',
      meta: 'Standard',
      cost: '$5,200',
      swatch: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
    },
  ],
  coping: [
    {
      id: 'travertine-silver',
      name: 'Travertine — Silver',
      meta: '94 LF · bullnose',
      cost: '$2,820',
      swatch: 'linear-gradient(135deg, #d6d3d1 0%, #a8a29e 50%, #78716c 100%)',
    },
    {
      id: 'travertine-ivory',
      name: 'Travertine — Ivory',
      meta: '94 LF',
      cost: '$2,640',
      swatch: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    },
    {
      id: 'concrete-cantilever',
      name: 'Cantilever Concrete',
      meta: '94 LF',
      cost: '$1,880',
      swatch: 'linear-gradient(135deg, #e7e5e4 0%, #a8a29e 100%)',
    },
  ],
  tileBand: [
    {
      id: 'glass-aqua-mix',
      name: 'Glass mosaic — Aqua mix',
      meta: '94 LF · 6" band',
      cost: '$1,410',
      swatch:
        'repeating-linear-gradient(45deg, #38bdf8 0 4px, #06b6d4 4px 8px, #0ea5e9 8px 12px)',
    },
    {
      id: 'porcelain-blue',
      name: 'Porcelain — Cobalt',
      meta: '94 LF',
      cost: '$1,120',
      swatch: 'repeating-linear-gradient(45deg, #1e40af 0 6px, #3b82f6 6px 12px)',
    },
    {
      id: 'glass-pearl',
      name: 'Glass — Pearl',
      meta: '94 LF',
      cost: '$1,560',
      swatch: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)',
    },
  ],
}

function MaterialRow({ slot, shapeId, label }: { slot: Slot; shapeId: string; label: string }) {
  const options = PLACEHOLDER_OPTIONS[slot]
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '')
  const current = options.find((o) => o.id === selectedId) ?? options[0]
  if (!current) return null

  function commit(materialId: string) {
    setSelectedId(materialId)
    void dispatch('pool.material.set', { id: shapeId, slot, materialId })
  }

  return (
    <section className="border-b border-borderLight">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">{label}</h4>
        <button className="text-textFaint hover:text-foreground" title="Add">
          <Plus className="h-3 w-3" />
        </button>
      </header>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="m-3 mt-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-pfSm border border-borderLight bg-white p-2 text-left hover:bg-rowHover focus:outline-none focus:ring-2 focus:ring-pfAccent"
          >
            <div
              className="h-7 w-7 shrink-0 rounded-pfXs border border-borderLight"
              style={{ background: current.swatch }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-medium leading-tight text-foreground">
                {current.name}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-textMuted">{current.meta}</div>
            </div>
            <div className="shrink-0 text-[11.5px] tabular-nums text-foreground">{current.cost}</div>
            <ChevronDown className="h-3 w-3 shrink-0 text-textFaint" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onSelect={() => commit(opt.id)}
              className="flex items-center gap-2"
            >
              <div
                className="h-4 w-4 shrink-0 rounded-pfXs border border-borderLight"
                style={{ background: opt.swatch }}
              />
              <span className="truncate text-[11.5px]">{opt.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  )
}

export function MaterialSection() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])

  if (!selectedId) {
    return (
      <section className="border-b border-borderLight">
        <header className="px-3 pb-1 pt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">Material</h4>
        </header>
        <div className="px-3 py-2 text-[11px] text-textFaint">No selection</div>
      </section>
    )
  }

  return (
    <>
      <MaterialRow slot="interior" shapeId={selectedId} label="Interior finish" />
      <MaterialRow slot="coping" shapeId={selectedId} label="Coping" />
      <MaterialRow slot="tileBand" shapeId={selectedId} label="Tile band" />
    </>
  )
}
