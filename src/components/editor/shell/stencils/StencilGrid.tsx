'use client'

import { useMemo } from 'react'
import { dispatch } from '@/lib/commands/dispatch'
import { STENCILS, type Stencil } from '@/modules/editor/stencils'
import { StencilCategory } from '@/modules/editor/stencils/types'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind } from '@/modules/editor/state/shapes'
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
    const shapes = useShapesStore.getState().shapes
    const pool = shapes.find((s) => s.kind === ShapeKind.RECTANGLE_POOL)
    // Drop offset to the side of the pool; if no pool, place near origin.
    // Stencil-count-based stagger so successive drops don't stack.
    const stencilCount = shapes.filter((s) => s.kind === ShapeKind.STENCIL).length
    const baseX = pool ? pool.x + pool.width + 24 : 0
    const baseY = pool ? pool.y : 0
    const offset = stencilCount * 36
    void dispatch('add.shape', {
      stencilId: stencil.id,
      x: baseX,
      y: baseY + offset,
    })
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
