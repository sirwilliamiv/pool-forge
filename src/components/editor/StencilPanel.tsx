'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { stencilsByCategory, type Stencil } from '@/modules/editor/stencils'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import type { ShapeKind } from '@/modules/editor/state/shapes'

const CATEGORY_LABEL: Record<Stencil['category'], string> = {
  'pool-shape': 'Pool shapes',
  'interior-feature': 'Interior features',
  'deck-house': 'Deck & house',
  'construction-symbol': 'Construction symbols',
  'water-outdoor': 'Water & outdoor',
}

// Stencils that have a real ShapeKind backing them. Everything else
// shows a "coming soon" toast.
const STENCIL_TO_KIND: Record<string, ShapeKind> = {
  'pool.rectangle': 'rectangle-pool',
  'deck.concrete': 'concrete-deck',
  'deck.paver': 'paver-deck',
  'deck.grass': 'grass-area',
  'feature.sun-shelf': 'sun-shelf',
  'feature.bench': 'bench',
  'pool.spa': 'spa',
  'pool-spa.rectangle': 'spa',
}

export function StencilPanel() {
  const [query, setQuery] = useState('')
  const addShape = useShapesStore((s) => s.addShape)
  const select = useSelectionStore((s) => s.select)

  const groups = stencilsByCategory()
  const order: Stencil['category'][] = [
    'pool-shape',
    'interior-feature',
    'deck-house',
    'construction-symbol',
    'water-outdoor',
  ]

  const filtered = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    const out = {} as Record<Stencil['category'], Stencil[]>
    for (const cat of order) {
      out[cat] = groups[cat].filter((s) => s.name.toLowerCase().includes(q))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, groups])

  function handleClick(stencil: Stencil) {
    const kind = STENCIL_TO_KIND[stencil.id]
    if (!kind) {
      toast(`${stencil.name} — coming soon`)
      return
    }
    const id = addShape(kind, 200, 200)
    select(id)
  }

  return (
    <aside className="flex w-64 flex-col overflow-hidden border-r bg-background">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Stencils
      </div>
      <div className="border-b p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stencils…"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {order.map((category) => {
          const items = filtered[category] ?? []
          if (items.length === 0) return null
          return (
            <Card key={category} className="border-none shadow-none">
              <CardHeader className="px-2 py-1.5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[category]} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-1 p-1 pt-0">
                {items.map((stencil) => {
                  const wired = Boolean(STENCIL_TO_KIND[stencil.id])
                  return (
                    <button
                      key={stencil.id}
                      type="button"
                      onClick={() => handleClick(stencil)}
                      className={`flex h-14 flex-col items-center justify-center rounded border bg-card px-1 text-[10px] leading-tight text-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${wired ? 'border-input' : 'border-dashed border-muted-foreground/30 opacity-70'}`}
                      title={wired ? `Click to add: ${stencil.name}` : `${stencil.name} (coming soon)`}
                    >
                      <span className="line-clamp-2 text-center">{stencil.name}</span>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </aside>
  )
}
