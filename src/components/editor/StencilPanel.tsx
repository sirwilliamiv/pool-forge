'use client'

import { useMemo, useState } from 'react'
import { StencilCategory, ShapeKind } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { stencilsByCategory, type Stencil } from '@/modules/editor/stencils'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

const CATEGORY_LABEL: Record<StencilCategory, string> = {
  [StencilCategory.POOL_SHAPE]: 'Pool shapes',
  [StencilCategory.INTERIOR_FEATURE]: 'Interior features',
  [StencilCategory.DECK_HOUSE]: 'Deck & house',
  [StencilCategory.CONSTRUCTION_SYMBOL]: 'Construction symbols',
  [StencilCategory.WATER_OUTDOOR]: 'Water & outdoor',
}

const CATEGORY_ORDER: StencilCategory[] = [
  StencilCategory.POOL_SHAPE,
  StencilCategory.INTERIOR_FEATURE,
  StencilCategory.DECK_HOUSE,
  StencilCategory.CONSTRUCTION_SYMBOL,
  StencilCategory.WATER_OUTDOOR,
]

export function StencilPanel() {
  const [query, setQuery] = useState('')
  const addShape = useShapesStore((s) => s.addShape)
  const addStencil = useShapesStore((s) => s.addStencil)
  const select = useSelectionStore((s) => s.select)

  const groups = stencilsByCategory()

  const filtered = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    const out = {} as Record<StencilCategory, Stencil[]>
    for (const cat of CATEGORY_ORDER) {
      out[cat] = (groups[cat] ?? []).filter((s) => s.name.toLowerCase().includes(q))
    }
    return out
  }, [query, groups])

  function handleClick(stencil: Stencil) {
    // Stencils with a dedicated ShapeKind go through addShape; the rest
    // materialize as the generic STENCIL kind via addStencil.
    let id: string
    if (stencil.shapeKind === ShapeKind.STENCIL) {
      id = addStencil(stencil.id, 200, 200)
    } else {
      id = addShape(stencil.shapeKind, 200, 200, { stencilId: stencil.id })
    }
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
        {CATEGORY_ORDER.map((category) => {
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
                {items.map((stencil) => (
                  <button
                    key={stencil.id}
                    type="button"
                    onClick={() => handleClick(stencil)}
                    className="flex h-14 flex-col items-center justify-center rounded border border-input bg-card px-1 text-[10px] leading-tight text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    title={`Click to add: ${stencil.name}`}
                  >
                    <span className="line-clamp-2 text-center">{stencil.name}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </aside>
  )
}
