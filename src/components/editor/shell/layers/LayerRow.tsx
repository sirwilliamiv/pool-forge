'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  Droplet,
  Eye,
  EyeOff,
  Flame,
  Layers as LayersIcon,
  Lock,
  Square,
  Sun,
  Unlock,
} from 'lucide-react'
import { ShapeKind, SHAPE_DEFAULTS, type Shape } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { dispatch } from '@/lib/commands/dispatch'

type IconKind = 'pool' | 'deck' | 'spa' | 'shelf' | 'bench' | 'stencil'

function iconKindFor(kind: ShapeKind): IconKind {
  if (kind === ShapeKind.RECTANGLE_POOL) return 'pool'
  if (
    kind === ShapeKind.CONCRETE_DECK ||
    kind === ShapeKind.PAVER_DECK ||
    kind === ShapeKind.GRASS_AREA
  )
    return 'deck'
  if (kind === ShapeKind.SPA) return 'spa'
  if (kind === ShapeKind.SUN_SHELF) return 'shelf'
  if (kind === ShapeKind.BENCH) return 'bench'
  return 'stencil'
}

const ICON: Record<IconKind, typeof Square> = {
  pool: Square,
  deck: LayersIcon,
  spa: Flame,
  shelf: Sun,
  bench: AlertTriangle,
  stencil: Droplet,
}

/**
 * What to call a layer nobody has renamed.
 *
 * The catalogue name first. Without it every generic stencil read as "Stencil",
 * so a yard with a fence, three trees and an equipment pad showed five identical
 * rows and the panel was unusable for finding anything.
 */
function defaultLabel(shape: Shape): string {
  const stencilId = 'stencilId' in shape ? shape.stencilId : undefined
  if (stencilId) {
    const stencil = getStencil(stencilId)
    if (stencil) return stencil.name
  }
  return SHAPE_DEFAULTS[shape.kind]?.label ?? shape.kind
}

function dimensionsBadge(shape: Shape): string | null {
  const w = shape.width
  const h = shape.height
  if (!w || !h) return null
  const wf = Math.round(w / 12)
  const hf = Math.round(h / 12)
  return `${wf}' × ${hf}'`
}

interface Props {
  shape: Shape
  selected: boolean
}

export function LayerRow({ shape, selected }: Props) {
  const Icon = useMemo(() => ICON[iconKindFor(shape.kind)], [shape.kind])
  const label = shape.name ?? defaultLabel(shape)
  const badge = dimensionsBadge(shape)

  function handleSelect() {
    void dispatch('selection.set', { ids: [shape.id] })
  }

  function toggleHidden(e: React.MouseEvent) {
    e.stopPropagation()
    void dispatch('shape.hide', { id: shape.id, hidden: !shape.hidden })
  }

  function toggleLocked(e: React.MouseEvent) {
    e.stopPropagation()
    void dispatch('shape.lock', { id: shape.id, locked: !shape.locked })
  }

  const rowBg = selected
    ? 'bg-pfRowActive text-pfAccentStrong'
    : 'text-foreground hover:bg-pfRowHover'
  const iconColor = selected ? 'text-pfAccentStrong' : 'text-textMuted'
  const dimColor = shape.hidden ? 'opacity-50' : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleSelect()
        }
      }}
      className={`group flex h-6 cursor-pointer items-center gap-1.5 rounded-pfXs px-1.5 ${rowBg} ${dimColor}`}
    >
      <span className="w-[14px]" aria-hidden />
      <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden />
      <span
        className={`flex-1 truncate text-[12px] ${shape.hidden ? 'line-through' : ''}`}
      >
        {label}
      </span>
      {badge ? (
        <span className="text-[10px] tabular-nums text-textFaint">{badge}</span>
      ) : null}

      <span
        className={`flex items-center gap-1 ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          type="button"
          aria-label={shape.locked ? 'Unlock layer' : 'Lock layer'}
          onClick={toggleLocked}
          className="grid h-4 w-4 place-items-center rounded-pfXs text-textFaint hover:bg-white hover:text-foreground"
        >
          {shape.locked ? (
            <Lock className="h-3 w-3" aria-hidden />
          ) : (
            <Unlock className="h-3 w-3" aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label={shape.hidden ? 'Show layer' : 'Hide layer'}
          onClick={toggleHidden}
          className="grid h-4 w-4 place-items-center rounded-pfXs text-textFaint hover:bg-white hover:text-foreground"
        >
          {shape.hidden ? (
            <EyeOff className="h-3 w-3 line-through" aria-hidden />
          ) : (
            <Eye className="h-3 w-3" aria-hidden />
          )}
        </button>
      </span>
    </div>
  )
}
