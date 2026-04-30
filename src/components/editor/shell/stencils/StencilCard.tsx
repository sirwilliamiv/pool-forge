'use client'

import type { Stencil } from '@/modules/editor/stencils'

interface Props {
  stencil: Stencil
  onAdd: (stencil: Stencil) => void
}

export function StencilCard({ stencil, onAdd }: Props) {
  const dim = stencil.defaultDimensions
  const widthFt = dim.unit === 'ft' ? dim.width : dim.width / 12
  const heightFt = dim.unit === 'ft' ? dim.height : dim.height / 12
  const dimLabel =
    Number.isInteger(widthFt) && Number.isInteger(heightFt)
      ? `${widthFt}' × ${heightFt}'`
      : `${widthFt.toFixed(1)}' × ${heightFt.toFixed(1)}'`

  return (
    <button
      type="button"
      onClick={() => onAdd(stencil)}
      title={`${stencil.name} (${dimLabel})`}
      className="group flex flex-col items-stretch gap-1 rounded-pfSm p-1 text-left hover:bg-rowHover focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
    >
      <div
        className="aspect-square w-full rounded-pfXs border"
        style={{
          background: stencil.defaultFill,
          borderColor: stencil.defaultStroke,
        }}
        aria-hidden
      />
      <div className="px-0.5">
        <div className="truncate text-[11px] font-medium text-foreground">{stencil.name}</div>
        <div className="truncate text-[10px] text-textFaint tabular-nums">{dimLabel}</div>
      </div>
    </button>
  )
}
