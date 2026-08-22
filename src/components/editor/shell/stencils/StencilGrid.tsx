'use client'

import { useMemo } from 'react'
import { dispatch } from '@/lib/commands/dispatch'
import { STENCILS, type Stencil } from '@/modules/editor/stencils'
import { StencilCategory } from '@/modules/editor/stencils/types'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { stagedCount, stagingPlacement } from '@/modules/editor/placement'
import { StencilCard } from './StencilCard'

const CATEGORY_LABEL: Record<StencilCategory, string> = {
  [StencilCategory.POOL_SHAPE]: 'Pool shapes',
  [StencilCategory.INTERIOR_FEATURE]: 'Steps & shelves',
  [StencilCategory.WATER_OUTDOOR]: 'Water & outdoor',
  [StencilCategory.DECK_HOUSE]: 'Site & deck',
  [StencilCategory.CONSTRUCTION_SYMBOL]: 'Construction symbols',
}

const CATEGORY_ORDER: StencilCategory[] = [
  StencilCategory.POOL_SHAPE,
  StencilCategory.INTERIOR_FEATURE,
  StencilCategory.WATER_OUTDOOR,
  StencilCategory.DECK_HOUSE,
  StencilCategory.CONSTRUCTION_SYMBOL,
]

interface Props {
  search: string
}

export function StencilGrid({ search }: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? STENCILS.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q),
        )
      : STENCILS

    const groups = new Map<StencilCategory, Stencil[]>()
    for (const s of list) {
      const arr = groups.get(s.category) ?? []
      arr.push(s)
      groups.set(s.category, arr)
    }
    return groups
  }, [search])

  const onAdd = (stencil: Stencil) => {
    // Staged in a block beside whatever is already drawn, rather than queued in
    // a line. The old rule anchored to RECTANGLE_POOL alone, so a Grecian or a
    // pool-and-spa stranded everything at the origin, and its fixed stagger ran
    // thirty-six objects about ninety-six feet down the sheet.
    const shapes = useShapesStore.getState().shapes
    const { x, y } = stagingPlacement(shapes, stencil.id, stagedCount(shapes))
    void dispatch('add.shape', { stencilId: stencil.id, x, y })
  }

  if (filtered.size === 0) {
    return (
      <p className="px-3 py-3 text-[11.5px] text-textFaint">
        No stencils match “{search}”.
      </p>
    )
  }

  return (
    <div className="pb-3">
      {CATEGORY_ORDER.map((cat) => {
        const items = filtered.get(cat)
        if (!items || items.length === 0) return null
        return (
          <section key={cat}>
            <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
              <span>
                {CATEGORY_LABEL[cat]}
                <span className="ml-1 text-textFaint">{items.length}</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 px-2">
              {items.map((s) => (
                <StencilCard key={s.id} stencil={s} onAdd={onAdd} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
