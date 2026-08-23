import { ExportVisibility, ShapeKind } from '@prisma/client'
import type { Shape } from '@/modules/editor/state/shapes'
import { isStencil } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { fillForShape, labelForShape, shapesBoundingBox } from '@/modules/exports/svg'

interface DrawingSvgProps {
  shapes: Shape[]
  widthPx?: number
  heightPx?: number
  showLabels?: boolean
}

/**
 * Whether this object belongs on a customer-facing render.
 *
 * Every stencil in the catalogue has carried an `exportVisibility` since it was
 * written and nothing had ever read it, so a property line, a setback line and
 * an equipment pad all drew straight onto the proposal. This is the render a
 * customer sees; the construction symbols belong on the plan sheets, which draw
 * themselves through `TechnicalPlanSvg`.
 */
function onCustomerRender(shape: Shape): boolean {
  if (!isStencil(shape)) return true
  const def = getStencil(shape.stencilId)
  if (!def) return true
  return def.exportVisibility !== ExportVisibility.CONSTRUCTION && def.exportVisibility !== ExportVisibility.NONE
}

// Coping band drawn around a pool, and the plan grid spacing. Both in inches
// (the drawing's world unit).
const COPING_IN = 16
const GRID_IN = 60 // 5 ft reference grid

function isWater(kind: ShapeKind): boolean {
  return kind === ShapeKind.RECTANGLE_POOL || kind === ShapeKind.SPA
}

export function DrawingSvg({
  shapes,
  widthPx = 760,
  heightPx = 420,
  showLabels = true,
}: DrawingSvgProps) {
  const visible = shapes.filter((s) => !s.hidden && onCustomerRender(s))
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
      <defs>
        <linearGradient id="pf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <pattern id="pf-grid" width={GRID_IN} height={GRID_IN} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID_IN} 0 L 0 0 0 ${GRID_IN}`} fill="none" stroke="#eef2f7" strokeWidth={1.5} />
        </pattern>
        <filter id="pf-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
      </defs>

      <rect x={vp.x} y={vp.y} width={vp.width} height={vp.height} fill="url(#pf-grid)" />

      {sorted.map((s) => {
        const cx = s.width / 2
        const cy = s.height / 2
        const water = isWater(s.kind)
        const isEllipsePool =
          s.kind === ShapeKind.RECTANGLE_POOL && s.displayHint?.poolShape === 'ellipse'
        const rx = Math.min(s.width, s.height) * (water ? 0.18 : 0.04)
        const labelFontSize = Math.max(8, Math.min(s.width, s.height) * 0.08)
        const palette = fillForShape(s)
        return (
          <g key={s.id} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation} ${cx} ${cy})`}>
            {s.kind === ShapeKind.RECTANGLE_POOL ? (
              isEllipsePool ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={cx + COPING_IN}
                  ry={cy + COPING_IN}
                  fill="#e7e2d8"
                  stroke="#c9c0ad"
                  strokeWidth={1.5}
                  filter="url(#pf-shadow)"
                />
              ) : (
                <rect
                  x={-COPING_IN}
                  y={-COPING_IN}
                  width={s.width + COPING_IN * 2}
                  height={s.height + COPING_IN * 2}
                  rx={rx + COPING_IN}
                  fill="#e7e2d8"
                  stroke="#c9c0ad"
                  strokeWidth={1.5}
                  filter="url(#pf-shadow)"
                />
              )
            ) : null}
            {water ? (
              isEllipsePool ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={cx}
                  ry={cy}
                  fill="url(#pf-water)"
                  stroke="#0369a1"
                  strokeWidth={1.5}
                />
              ) : (
                <>
                  <rect
                    x={0}
                    y={0}
                    width={s.width}
                    height={s.height}
                    rx={rx}
                    fill="url(#pf-water)"
                    stroke="#0369a1"
                    strokeWidth={1.5}
                  />
                  <rect
                    x={s.width * 0.1}
                    y={s.height * 0.28}
                    width={s.width * 0.8}
                    height={Math.max(1.5, s.height * 0.015)}
                    rx={2}
                    fill="#ffffff"
                    opacity={0.35}
                  />
                  <rect
                    x={s.width * 0.1}
                    y={s.height * 0.52}
                    width={s.width * 0.55}
                    height={Math.max(1.5, s.height * 0.012)}
                    rx={2}
                    fill="#ffffff"
                    opacity={0.22}
                  />
                </>
              )
            ) : (
              <rect
                x={0}
                y={0}
                width={s.width}
                height={s.height}
                rx={rx}
                fill={palette.fill}
                fillOpacity={0.85}
                stroke={palette.stroke}
                strokeWidth={1.5}
                filter="url(#pf-shadow)"
                {...(palette.dash ? { strokeDasharray: palette.dash } : {})}
              />
            )}
            {showLabels ? (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="sans-serif"
                fontSize={labelFontSize}
                fill={water ? '#082f49' : '#0f172a'}
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
