'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { stencilsByCategory, type Stencil } from '@/modules/editor/stencils'

const CATEGORY_LABEL: Record<Stencil['category'], string> = {
  'pool-shape': 'Pool shapes',
  'interior-feature': 'Interior features',
  'deck-house': 'Deck & house',
  'construction-symbol': 'Construction symbols',
  'water-outdoor': 'Water & outdoor',
}

export function StencilPanel() {
  const groups = stencilsByCategory()
  const order: Stencil['category'][] = [
    'pool-shape',
    'interior-feature',
    'deck-house',
    'construction-symbol',
    'water-outdoor',
  ]

  return (
    <aside className="flex w-60 flex-col overflow-y-auto border-r bg-background">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Stencils
      </div>
      <div className="flex-1 space-y-3 p-2">
        {order.map((category) => (
          <Card key={category} className="border-none shadow-none">
            <CardHeader className="px-2 py-1.5">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABEL[category]} ({groups[category].length})
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-1 p-1 pt-0">
              {groups[category].map((stencil) => (
                <button
                  key={stencil.id}
                  type="button"
                  className="flex h-14 flex-col items-center justify-center rounded border border-input bg-card px-1 text-[10px] leading-tight text-foreground hover:bg-accent hover:text-accent-foreground"
                  draggable
                  data-stencil-id={stencil.id}
                  title={stencil.name}
                >
                  <span className="line-clamp-2 text-center">{stencil.name}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </aside>
  )
}
