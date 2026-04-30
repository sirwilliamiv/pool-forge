'use client'

import { useMemo, useState } from 'react'
import { MaterialCard } from './MaterialCard'

export type MaterialKindLite =
  | 'POOL_WATER'
  | 'CONCRETE_DECK'
  | 'PAVER_DECK'
  | 'GRASS'
  | 'COPING'
  | 'SCREEN'
  | 'LANAI'
  | 'CUSTOM'

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

export interface RawMaterial {
  id: string
  kind: MaterialKindLite
  name: string
  fillSpec: unknown
}

export interface MaterialView {
  id: string
  kind: MaterialKindLite
  name: string
  brand: string | null
  costLabel: string | null
  swatch: string
  slot: 'interior' | 'coping' | 'tileBand' | null
}

interface MaterialGridProps {
  materials: RawMaterial[]
  searchQuery?: string
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function buildSwatch(spec: Record<string, unknown>, kind: MaterialKindLite): string {
  const type = typeof spec.type === 'string' ? spec.type : 'solid'
  const color = typeof spec.color === 'string' ? spec.color : kindFallback(kind)
  const secondary =
    typeof spec.secondary === 'string' ? spec.secondary : darken(color)
  if (type === 'mosaic') {
    return `repeating-linear-gradient(45deg, ${color} 0 4px, ${secondary} 4px 8px)`
  }
  if (type === 'gradient') {
    return `linear-gradient(135deg, ${color} 0%, ${secondary} 100%)`
  }
  return color
}

function kindFallback(kind: MaterialKindLite): string {
  switch (kind) {
    case 'POOL_WATER':
      return '#7DB9E8'
    case 'CONCRETE_DECK':
      return '#D9D6CF'
    case 'PAVER_DECK':
      return '#D6BFA0'
    case 'GRASS':
      return '#9CCC8E'
    case 'COPING':
      return '#A8A29E'
    default:
      return '#94A3B8'
  }
}

function darken(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m || !m[1]) return hex
  const n = parseInt(m[1], 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - 24)
  const g = Math.max(0, ((n >> 8) & 0xff) - 24)
  const b = Math.max(0, (n & 0xff) - 24)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function buildView(raw: RawMaterial): MaterialView {
  const spec = asRecord(raw.fillSpec)
  const brand = typeof spec.brand === 'string' ? spec.brand : null
  const unit =
    spec.unit === 'lf' ? 'lf' : spec.unit === 'sqft' ? 'sqft' : null
  const cost =
    typeof spec.costPerSqft === 'number'
      ? spec.costPerSqft
      : typeof spec.costPerLf === 'number'
        ? spec.costPerLf
        : null
  const costLabel =
    cost !== null
      ? `$${cost.toFixed(2)}/${unit ?? 'unit'}`
      : null
  const slotRaw = typeof spec.slot === 'string' ? spec.slot : null
  const slot: MaterialView['slot'] =
    slotRaw === 'interior' || slotRaw === 'coping' || slotRaw === 'tileBand'
      ? slotRaw
      : raw.kind === 'COPING'
        ? 'coping'
        : null
  return {
    id: raw.id,
    kind: raw.kind,
    name: raw.name,
    brand,
    costLabel,
    swatch: buildSwatch(spec, raw.kind),
    slot,
  }
}

export function MaterialGrid({ materials, searchQuery }: MaterialGridProps) {
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const q = (searchQuery ?? '').trim().toLowerCase()
    const filtered = materials.filter((m) =>
      q === '' ? true : m.name.toLowerCase().includes(q),
    )
    const views = filtered.map(buildView)
    const byKind = new Map<MaterialKindLite, MaterialView[]>()
    for (const v of views) {
      const list = byKind.get(v.kind) ?? []
      list.push(v)
      byKind.set(v.kind, list)
    }
    return KIND_ORDER.flatMap((kind) => {
      const list = byKind.get(kind)
      if (!list || list.length === 0) return []
      return [{ kind, items: list }]
    })
  }, [materials, searchQuery])

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
                  <MaterialCard key={m.id} material={m} />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
