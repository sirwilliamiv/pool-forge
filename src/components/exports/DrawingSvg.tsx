import type { Shape } from '@/modules/editor/state/shapes'
import { fillForKind, labelForShape, shapesBoundingBox } from '@/modules/exports/svg'

interface DrawingSvgProps {
  shapes: Shape[]
  widthPx?: number
  heightPx?: number
  showLabels?: boolean
}

export function DrawingSvg({
  shapes,
  widthPx = 760,
  heightPx = 420,
  showLabels = true,
}: DrawingSvgProps) {
  const visible = shapes.filter((s) => !s.hidden)
  const vp = shapesBoundingBox(visible)
  const sorted = [...visible].sort((a, b) => a.zIndex - b.zIndex)

  if (sorted.length === 0) {
    return (
      <svg
        width={widthPx}
        height={heightPx}
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        xmlns="http://www.w3.org/2000/svg"
        className="block border bg-slate-50"
      >
        <text
          x={widthPx / 2}
          y={heightPx / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="sans-serif"
          fontSize={14}
          fill="#94a3b8"
        >
          No shapes drawn
        </text>
      </svg>
    )
  }

  return (
    <svg
      width={widthPx}
      height={heightPx}
      viewBox={`${vp.x} ${vp.y} ${vp.width} ${vp.height}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="block border bg-white"
    >
      {sorted.map((s) => {
        const palette = fillForKind(s.kind)
        const cx = s.width / 2
        const cy = s.height / 2
        const labelFontSize = Math.max(8, Math.min(s.width, s.height) * 0.08)
        return (
          <g
            key={s.id}
            transform={`translate(${s.x} ${s.y}) rotate(${s.rotation} ${cx} ${cy})`}
          >
            <rect
              x={0}
              y={0}
              width={s.width}
              height={s.height}
              fill={palette.fill}
              stroke={palette.stroke}
              strokeWidth={1.5}
              {...(palette.dash ? { strokeDasharray: palette.dash } : {})}
            />
            {showLabels ? (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="sans-serif"
                fontSize={labelFontSize}
                fill="#0f172a"
                fontWeight={600}
              >
                {labelForShape(s)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
