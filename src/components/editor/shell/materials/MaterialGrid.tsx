'use client'

import { useMemo, useState } from 'react'
import { MaterialCard } from './MaterialCard'
import { useMaterialsStore } from '@/modules/editor/state/materialsStore'
import { SLOT_LABEL, optionFor, type CatalogMaterial, type MaterialKindLite } from '@/modules/materials/catalog'

export type { MaterialKindLite }

const KIND_LABELS: Record<MaterialKindLite, string> = {
  POOL_WATER: 'Pool water',
  CONCRETE_DECK: 'Concrete deck',
  PAVER_DECK: 'Pavers',
  GRASS: 'Grass',
  COPING: 'Coping',
  SCREEN: 'Screen',
  LANAI: 'Lanai',
  CUSTOM: 'Interior finishes',
}

const KIND_ORDER: MaterialKindLite[] = [
  'CUSTOM',
  'COPING',
  'POOL_WATER',
  'CONCRETE_DECK',
  'PAVER_DECK',
  'GRASS',
  'SCREEN',
  'LANAI',
]

export interface MaterialView {
  material: CatalogMaterial
  /**
   * The price the quote will bill for this finish, or null.
   *
   * Read from the price book, never from the material row. Ten materials used
   * to carry prices of their own — `PebbleTec — Cobalt $7.10/sqft` — that no
   * quote had ever charged, and a builder showing this panel to a customer was
   * showing them a price list the product did not honour.
   */
  priceLabel: string | null
  /** Set when this finish is offered but nothing in the price book bills it. */
  unpricedNote: string | null
  /** Which pool surface it applies to, in words, or null for a plain fill. */
  slotLabel: string | null
}

interface MaterialGridProps {
  searchQuery?: string
}

export function MaterialGrid({ searchQuery }: MaterialGridProps) {
  const catalog = useMaterialsStore((s) => s.catalog)
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const q = (searchQuery ?? '').trim().toLowerCase()
    const views: MaterialView[] = catalog.materials
      .filter((m) => (q === '' ? true : m.name.toLowerCase().includes(q)))
      .map((material) => {
        const option = optionFor(catalog, material.id)
        return {
          material,
          priceLabel: option?.price?.label ?? null,
          unpricedNote: option ? option.unpricedReason : null,
          slotLabel: material.slot ? SLOT_LABEL[material.slot] : null,
        }
      })
    const byKind = new Map<MaterialKindLite, MaterialView[]>()
    for (const view of views) {
      const list = byKind.get(view.material.kind) ?? []
      list.push(view)
      byKind.set(view.material.kind, list)
    }
    return KIND_ORDER.flatMap((kind) => {
      const list = byKind.get(kind)
      if (!list || list.length === 0) return []
      return [{ kind, items: list }]
    })
  }, [catalog, searchQuery])

  if (grouped.length === 0) {
    return (
      <div className="px-3 py-3 text-[11.5px] text-textFaint">
        No materials in this org yet. Run <code>pnpm db:seed</code> to populate
        the demo set.
      </div>
    )
  }

  return (
    <div className="pb-3">
      {grouped.map(({ kind, items }) => {
        const collapsed = groupExpanded[kind] === false
        return (
          <section key={kind}>
            <button
              type="button"
              onClick={() =>
                setGroupExpanded((s) => ({ ...s, [kind]: collapsed }))
              }
              className="flex w-full items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted hover:text-foreground"
            >
              <span>
                {KIND_LABELS[kind]}
                <span className="ml-1 text-textFaint">{items.length}</span>
              </span>
              <span className="text-textFaint">{collapsed ? '+' : '–'}</span>
            </button>
            {!collapsed ? (
              <div className="space-y-1 px-2">
                {items.map((m) => (
                  <MaterialCard key={m.material.id} view={m} />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
