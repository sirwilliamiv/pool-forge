'use client'

// The backyard, drawn as a plan.
//
// This is the page's whole argument. A configurator that renders a glossy 3D
// pool is selling; a configurator that renders a dimensioned plan is showing
// its working, and showing the working is why the number under it is worth
// believing. It is also what Pool Forge actually prints, so the thing a
// homeowner plays with here is a smaller version of the sheet their builder
// will hand a contractor.
//
// All geometry comes from `modules/dream/yard.ts` in feet. The only thing this
// file decides is how a foot is drawn.

import { useId } from 'react'

import type { YardLayout } from '@/modules/dream/yard'

interface YardPlanProps {
  readonly layout: YardLayout
  readonly lengthFt: number
  readonly widthFt: number
  readonly deepFt: number
}

/** Line weights, in feet, so they scale with the drawing rather than the screen. */
const HAIRLINE = 0.14
const OBJECT_LINE = 0.3

/** Feet of clear space outside the paving for the dimension lines to live in. */
const DIM_GUTTER = 4.5

function feet(n: number): string {
  // Whole feet on a plan. Inches on a homeowner's drawing are noise.
  return `${Math.round(n)}'`
}

export function YardPlan({ layout, lengthFt, widthFt, deepFt }: YardPlanProps) {
  const gridId = useId()
  const { pool, deck, colors } = layout

  // The sheet is the yard plus room for the dimension strings on two sides.
  const minX = -DIM_GUTTER
  const minY = -DIM_GUTTER
  const sheetW = layout.width + DIM_GUTTER
  const sheetH = layout.height + DIM_GUTTER

  const dimY = deck.y + deck.h + DIM_GUTTER * 0.55
  const dimX = deck.x + deck.w + DIM_GUTTER * 0.55

  return (
    <svg
      viewBox={`${minX} ${minY} ${sheetW} ${sheetH}`}
      // Capped on a phone so the drawing does not eat the whole first screen:
      // a visitor who has to scroll before finding a single control has been
      // shown a picture rather than handed a thing to play with. The viewBox
      // letterboxes, so the plan just gets smaller.
      className="h-auto max-h-[42vh] w-full lg:max-h-none"
      role="img"
      aria-label={`Plan of a ${feet(lengthFt)} by ${feet(widthFt)} pool, ${feet(deepFt)} at the deep end, with paving around it`}
    >
      <defs>
        {/* One-foot grid. The scale reference that makes every other line legible. */}
        <pattern id={gridId} width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#8FAE78" strokeWidth="0.06" />
        </pattern>
      </defs>

      <rect x={minX} y={minY} width={sheetW} height={sheetH} fill={colors.grass} />
      <rect x={minX} y={minY} width={sheetW} height={sheetH} fill={`url(#${gridId})`} opacity="0.65" />

      {/* Paving. */}
      <rect
        x={deck.x}
        y={deck.y}
        width={deck.w}
        height={deck.h}
        rx="1.5"
        fill={colors.deck}
        stroke="#1C2024"
        strokeWidth={HAIRLINE}
      />

      {/* Coping: the pale band the pool sits inside. Drawn as a fat stroke on
          the water's own outline so it follows every shape for free. */}
      <path
        d={layout.poolPath}
        fill={colors.coping}
        stroke={colors.coping}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d={layout.poolPath}
        fill={colors.water}
        stroke="#1C2024"
        strokeWidth={OBJECT_LINE}
        strokeLinejoin="round"
        className="dream-water"
      />

      {layout.spa && (
        <g>
          <circle
            cx={layout.spa.cx}
            cy={layout.spa.cy}
            r={layout.spa.r + 0.9}
            fill={colors.coping}
          />
          <circle
            cx={layout.spa.cx}
            cy={layout.spa.cy}
            r={layout.spa.r}
            fill={colors.water}
            stroke="#1C2024"
            strokeWidth={OBJECT_LINE}
          />
          <text
            x={layout.spa.cx}
            y={layout.spa.cy + 0.5}
            textAnchor="middle"
            className="dream-plan-label"
            fontSize="1.6"
          >
            SPA
          </text>
        </g>
      )}

      {layout.screen && (
        <rect
          x={layout.screen.x}
          y={layout.screen.y}
          width={layout.screen.w}
          height={layout.screen.h}
          rx="1.5"
          fill="none"
          stroke="#1C2024"
          strokeWidth={HAIRLINE * 1.6}
          strokeDasharray="1.4 0.9"
          opacity="0.75"
        />
      )}

      {layout.lights.map((light, i) => (
        <circle
          key={`light-${i}`}
          cx={light.x}
          cy={light.y}
          r="0.62"
          fill="#FFE9A8"
          stroke="#1C2024"
          strokeWidth={HAIRLINE}
        />
      ))}

      {layout.features.map((feature, i) => (
        <path
          key={`feature-${i}`}
          d={`M ${feature.x - 1.1} ${feature.y} L ${feature.x} ${feature.y - 1.5} L ${feature.x + 1.1} ${feature.y} Z`}
          fill={colors.water}
          stroke="#1C2024"
          strokeWidth={HAIRLINE}
        />
      ))}

      {/* Dimension strings. Witness lines, arrow ticks and a figure sitting on
          the line, which is how a pool is dimensioned on a real sheet. */}
      <DimensionRow from={pool.x} to={pool.x + pool.w} y={dimY} anchor={pool.y + pool.h} label={feet(lengthFt)} />
      <DimensionColumn from={pool.y} to={pool.y + pool.h} x={dimX} anchor={pool.x + pool.w} label={feet(widthFt)} />

      {/* Depth note, on a leader pointing into the deep end. The label lands
          clear of the paving's edge rather than on it: annotation crossing a
          line it is not annotating is what makes a drawing hard to read. */}
      <g>
        <line
          x1={pool.x + pool.w * 0.16}
          y1={pool.y + pool.h * 0.5}
          x2={deck.x + 1.4}
          y2={deck.y - 0.9}
          stroke="#1C2024"
          strokeWidth={HAIRLINE}
        />
        <circle cx={pool.x + pool.w * 0.16} cy={pool.y + pool.h * 0.5} r="0.28" fill="#1C2024" />
        <text
          x={deck.x + 1.6}
          y={deck.y - 1.5}
          textAnchor="start"
          className="dream-plan-label"
          fontSize="1.5"
        >
          {feet(deepFt)} DEEP
        </text>
      </g>
    </svg>
  )
}

/** A horizontal dimension: witness lines down from the object, ticks, figure. */
function DimensionRow({
  from,
  to,
  y,
  anchor,
  label,
}: {
  from: number
  to: number
  y: number
  anchor: number
  label: string
}) {
  const mid = (from + to) / 2
  return (
    <g stroke="#1C2024" strokeWidth={HAIRLINE} fill="none">
      <line x1={from} y1={anchor} x2={from} y2={y + 1} />
      <line x1={to} y1={anchor} x2={to} y2={y + 1} />
      <line x1={from} y1={y} x2={to} y2={y} />
      <Tick x={from} y={y} />
      <Tick x={to} y={y} />
      <rect x={mid - label.length * 0.85 - 0.6} y={y - 1.35} width={label.length * 1.7 + 1.2} height="2.7" fill="#BFD9A8" stroke="none" />
      <text x={mid} y={y + 0.62} textAnchor="middle" className="dream-plan-label" fontSize="2" stroke="none" fill="#1C2024">
        {label}
      </text>
    </g>
  )
}

/** The same, turned ninety degrees. Its figure stays upright, as on a sheet. */
function DimensionColumn({
  from,
  to,
  x,
  anchor,
  label,
}: {
  from: number
  to: number
  x: number
  anchor: number
  label: string
}) {
  const mid = (from + to) / 2
  return (
    <g stroke="#1C2024" strokeWidth={HAIRLINE} fill="none">
      <line x1={anchor} y1={from} x2={x + 1} y2={from} />
      <line x1={anchor} y1={to} x2={x + 1} y2={to} />
      <line x1={x} y1={from} x2={x} y2={to} />
      <Tick x={x} y={from} />
      <Tick x={x} y={to} />
      <rect x={x - label.length * 0.85 - 0.6} y={mid - 1.35} width={label.length * 1.7 + 1.2} height="2.7" fill="#BFD9A8" stroke="none" />
      <text x={x} y={mid + 0.62} textAnchor="middle" className="dream-plan-label" fontSize="2" stroke="none" fill="#1C2024">
        {label}
      </text>
    </g>
  )
}

/** The 45-degree slash a draughtsman uses instead of an arrowhead. */
function Tick({ x, y }: { x: number; y: number }) {
  return <line x1={x - 0.55} y1={y + 0.55} x2={x + 0.55} y2={y - 0.55} />
}
