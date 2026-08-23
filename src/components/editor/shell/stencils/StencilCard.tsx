'use client'

import type { Stencil } from '@/modules/editor/stencils'

interface Props {
  stencil: Stencil
  onAdd: (stencil: Stencil) => void
}

/** Longest side of the preview box, in px. The other side scales from it. */
const PREVIEW = 46

export function StencilCard({ stencil, onAdd }: Props) {
  const dim = stencil.defaultDimensions
  const widthFt = dim.unit === 'ft' ? dim.width : dim.width / 12
  const heightFt = dim.unit === 'ft' ? dim.height : dim.height / 12
  const dimLabel =
    Number.isInteger(widthFt) && Number.isInteger(heightFt)
      ? `${widthFt}' × ${heightFt}'`
      : `${widthFt.toFixed(1)}' × ${heightFt.toFixed(1)}'`

  // The preview is the footprint this stencil actually drops, drawn to scale.
  //
  // It used to be a full-bleed square of the stencil's fill colour, which made
  // all seventeen pool shapes an identical blue rectangle: a shape picker where
  // the shapes all look the same. There are no per-shape outlines in this
  // product yet (a Roman and a Grecian both render as a box on the canvas), so
  // rather than draw a silhouette the app cannot honour, this shows the one
  // thing that is true and does differ: how big it is and which way round.
  const longest = Math.max(widthFt, heightFt) || 1
  const w = Math.max(6, Math.round((widthFt / longest) * PREVIEW))
  const h = Math.max(6, Math.round((heightFt / longest) * PREVIEW))

  return (
    <button
      type="button"
      onClick={() => onAdd(stencil)}
      title={`${stencil.name} (${dimLabel})`}
      className="group flex items-center gap-2 rounded-pfSm p-1.5 text-left hover:bg-rowHover focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-pfXs bg-rowHover"
        style={{ width: PREVIEW + 8, height: PREVIEW + 8 }}
        aria-hidden
      >
        <span
          className="block rounded-[2px] border"
          style={{
            width: w,
            height: h,
            background: stencil.defaultFill,
            borderColor: stencil.defaultStroke,
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        {/* Not truncated. Two different pool shapes both read "Roman tw…" in
            the old two-line grid, which is a picker that cannot be used to
            pick. */}
        <span className="block text-[11px] font-medium leading-tight text-foreground">
          {stencil.name}
        </span>
        <span className="mt-0.5 block text-[10px] leading-tight text-textFaint tabular-nums">
          {dimLabel}
        </span>
      </span>
    </button>
  )
}
