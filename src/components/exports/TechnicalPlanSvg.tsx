import { ShapeKind } from '@prisma/client'

import { labelForShape } from '@/modules/exports/svg'
import { planFrame, scaleBarFeet, type PlanBox, type PlanVariant } from '@/modules/exports/plan'
import {
  EQUIPMENT_PAD_STENCIL,
  PROPERTY_LINE_STENCIL,
  STRUCTURE_STENCIL,
  findEquipmentPads,
  findPropertyLine,
  findStructures,
  isRegulated,
  regulatedBounds,
} from '@/modules/editor/site/model'
import type { Shape } from '@/modules/editor/state/shapes'

// The plan a permit office and a crew can both read.
//
// The site plan and the construction packet used to print the glossy blue
// render from the customer proposal: a gradient, a drop shadow, a highlight on
// the water, and not one dimension. That drawing is for selling. A plan checker
// scales off the paper and looks for the property line first; a crew needs the
// pool's centre lines and its distance to the house. Neither was on the sheet.
//
// Everything here is drawn from the shapes that are actually in the drawing.
// Nothing is drawn from a default, which is why a sheet with no property line
// says so instead of showing one.

export interface TechnicalPlanSvgProps {
  shapes: Shape[]
  variant: PlanVariant
  /** The printed size of the drawing box, in inches. Sets the true scale. */
  box: PlanBox
}

const INK = '#111827'
const LIGHT = '#6B7280'
const HAIRLINE = '#9CA3AF'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function ftLabel(inches: number): string {
  const feet = inches / 12
  const whole = Math.floor(Math.abs(feet))
  const rem = Math.round((Math.abs(feet) - whole) * 12)
  const sign = feet < 0 ? '-' : ''
  if (rem === 0) return `${sign}${whole}'-0"`
  if (rem === 12) return `${sign}${whole + 1}'-0"`
  return `${sign}${whole}'-${rem}"`
}

/** A horizontal dimension string with witness lines, drawn at world y. */
function DimH({
  x1,
  x2,
  y,
  from,
  to,
  k,
}: {
  x1: number
  x2: number
  y: number
  /** Where the measured feature sits, so the witness line reaches it. */
  from: number
  to: number
  k: number
}) {
  const tick = 4 * k
  const mid = (x1 + x2) / 2
  return (
    <g>
      <line x1={x1} y1={from} x2={x1} y2={y + tick} stroke={HAIRLINE} strokeWidth={0.8 * k} />
      <line x1={x2} y1={to} x2={x2} y2={y + tick} stroke={HAIRLINE} strokeWidth={0.8 * k} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth={1 * k} />
      <line x1={x1 - tick} y1={y + tick} x2={x1 + tick} y2={y - tick} stroke={INK} strokeWidth={1 * k} />
      <line x1={x2 - tick} y1={y + tick} x2={x2 + tick} y2={y - tick} stroke={INK} strokeWidth={1 * k} />
      <text
        x={mid}
        y={y - 3 * k}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={11 * k}
        fill={INK}
      >
        {ftLabel(Math.abs(x2 - x1))}
      </text>
    </g>
  )
}

/** A vertical dimension string, text rotated to read up the sheet. */
function DimV({
  y1,
  y2,
  x,
  from,
  to,
  k,
}: {
  y1: number
  y2: number
  x: number
  from: number
  to: number
  k: number
}) {
  const tick = 4 * k
  const mid = (y1 + y2) / 2
  return (
    <g>
      <line x1={from} y1={y1} x2={x + tick} y2={y1} stroke={HAIRLINE} strokeWidth={0.8 * k} />
      <line x1={to} y1={y2} x2={x + tick} y2={y2} stroke={HAIRLINE} strokeWidth={0.8 * k} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={INK} strokeWidth={1 * k} />
      <line x1={x - tick} y1={y1 + tick} x2={x + tick} y2={y1 - tick} stroke={INK} strokeWidth={1 * k} />
      <line x1={x - tick} y1={y2 + tick} x2={x + tick} y2={y2 - tick} stroke={INK} strokeWidth={1 * k} />
      <text
        x={x - 3 * k}
        y={mid}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 3 * k} ${mid})`}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={11 * k}
        fill={INK}
      >
        {ftLabel(Math.abs(y2 - y1))}
      </text>
    </g>
  )
}

function NorthArrow({ x, y, k }: { x: number; y: number; k: number }) {
  const r = 22 * k
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={0} r={r} fill="#ffffff" stroke={INK} strokeWidth={1 * k} />
      <path d={`M 0 ${-r * 0.72} L ${r * 0.34} ${r * 0.42} L 0 ${r * 0.16} L ${-r * 0.34} ${r * 0.42} Z`} fill={INK} />
      <text
        x={0}
        y={-r - 4 * k}
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={12 * k}
        fontWeight={700}
        fill={INK}
      >
        N
      </text>
    </g>
  )
}

function ScaleBar({
  x,
  y,
  k,
  ftPerInch,
}: {
  x: number
  y: number
  k: number
  ftPerInch: number
}) {
  const barFt = scaleBarFeet(ftPerInch)
  const length = barFt * 12
  const height = 5 * k
  const segments = 4
  const step = length / segments
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: segments }, (_, i) => (
        <rect
          key={i}
          x={i * step}
          y={0}
          width={step}
          height={height}
          fill={i % 2 === 0 ? INK : '#ffffff'}
          stroke={INK}
          strokeWidth={0.8 * k}
        />
      ))}
      {[0, segments / 2, segments].map(i => (
        <text
          key={i}
          x={i * step}
          y={-3 * k}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={9 * k}
          fill={INK}
        >
          {Math.round((barFt / segments) * i)}
        </text>
      ))}
      <text
        x={0}
        y={height + 11 * k}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={9 * k}
        fill={LIGHT}
      >
        {`FEET · 1 in = ${ftPerInch} ft at full size`}
      </text>
    </g>
  )
}

/** The three catalogue ids the plan draws itself, in their own layers. */
function isSiteStencil(shape: Shape): boolean {
  if (shape.kind !== ShapeKind.STENCIL) return false
  return (
    shape.stencilId === PROPERTY_LINE_STENCIL ||
    shape.stencilId === STRUCTURE_STENCIL ||
    shape.stencilId === EQUIPMENT_PAD_STENCIL
  )
}

/**
 * What to call a thing on a plan.
 *
 * The name only: the size is on the dimension string beside it, and repeating
 * it inside the outline is what made "POOL 25x12 FT" too wide to fit in a 25 ft
 * pool at 1 in = 20 ft.
 */
function shortPlanLabel(shape: Shape): string {
  switch (shape.kind) {
    case ShapeKind.RECTANGLE_POOL:
    case ShapeKind.POLYGON_POOL:
      return 'POOL'
    case ShapeKind.SPA:
      return 'SPA'
    case ShapeKind.SUN_SHELF:
      return 'SUN SHELF'
    case ShapeKind.BENCH:
      return 'BENCH'
    case ShapeKind.CONCRETE_DECK:
      return 'CONCRETE DECK'
    case ShapeKind.PAVER_DECK:
      return 'PAVER DECK'
    case ShapeKind.GRASS_AREA:
      return 'LAWN'
    case ShapeKind.SKETCH_PATH:
      // Whatever the drawer called it, in the sheet's voice. A sketch with no
      // label says nothing rather than inventing a name for a bare line.
      return shape.labelText?.trim().toUpperCase() ?? ''
    case ShapeKind.STENCIL:
      return labelForShape(shape).replace(/\s+[\d.]+×[\d.]+.*$/, '').toUpperCase()
  }
}

/**
 * Whether a label fits inside the thing it names.
 *
 * A 7 ft spa beside an 8 ft sun shelf printed "SPASUN SHELF 8x4" across both of
 * them on a 1 in = 40 ft sheet. An unreadable label is worse than none: the
 * object is dimensioned either way, and the legend says what the outline means.
 */
function labelFits(text: string, widthIn: number, fontSizeIn: number): boolean {
  return text.length * fontSizeIn * 0.58 <= widthIn
}

function isDeckKind(kind: ShapeKind): boolean {
  return (
    kind === ShapeKind.CONCRETE_DECK ||
    kind === ShapeKind.PAVER_DECK ||
    kind === ShapeKind.GRASS_AREA
  )
}

export function TechnicalPlanSvg({ shapes, variant, box }: TechnicalPlanSvgProps) {
  const visible = shapes.filter(shape => !shape.hidden)
  const frame = planFrame(visible, box)
  const { view, ftPerInch } = frame
  // One factor for every stroke and glyph, so the sheet looks the same at any
  // scale. A stroke width in world inches would vanish on a big lot.
  const k = view.width / 1_000

  const lot = findPropertyLine(visible)
  const structures = findStructures(visible)
  const pads = findEquipmentPads(visible)
  const water = regulatedBounds(visible)

  if (frame.empty) {
    return (
      <svg
        viewBox={`0 0 ${box.widthIn * 100} ${box.heightIn * 100}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={box.widthIn * 100} height={box.heightIn * 100} fill="#ffffff" />
        <text
          x={(box.widthIn * 100) / 2}
          y={(box.heightIn * 100) / 2}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={18}
          fill={LIGHT}
        >
          Nothing has been drawn for this project yet.
        </text>
      </svg>
    )
  }

  const ordered = [...visible].sort((a, b) => a.zIndex - b.zIndex)
  const primaryPool = ordered
    .filter(shape => shape.kind === ShapeKind.RECTANGLE_POOL || shape.kind === ShapeKind.POLYGON_POOL)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0]

  const envelope: Rect | null =
    lot &&
    (lot.limits.frontFt !== undefined ||
      lot.limits.sideFt !== undefined ||
      lot.limits.rearFt !== undefined)
      ? {
          x: lot.x + (lot.limits.sideFt ?? 0) * 12,
          y: lot.y + (lot.limits.frontFt ?? 0) * 12,
          width: lot.width - ((lot.limits.sideFt ?? 0) * 2 * 12),
          height: lot.height - ((lot.limits.frontFt ?? 0) + (lot.limits.rearFt ?? 0)) * 12,
        }
      : null

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="pf-hatch"
          width={12 * k}
          height={12 * k}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={12 * k} stroke={HAIRLINE} strokeWidth={1.2 * k} />
        </pattern>
        <pattern id="pf-pad-hatch" width={9 * k} height={9 * k} patternUnits="userSpaceOnUse">
          <path d={`M 0 ${9 * k} L ${9 * k} 0`} stroke={HAIRLINE} strokeWidth={1 * k} />
        </pattern>
      </defs>

      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#ffffff" />

      {/* Deck and paving: the ground the pool sits in, kept quiet. */}
      {ordered
        .filter(shape => isDeckKind(shape.kind))
        .map(shape => (
          <g key={shape.id}>
            <rect
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill="#F3F4F6"
              stroke={LIGHT}
              strokeWidth={1.2 * k}
            />
            {labelFits(shortPlanLabel(shape), shape.width, 10 * k) ? (
              <text
                x={shape.x + shape.width / 2}
                y={shape.y + shape.height - 6 * k}
                textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize={10 * k}
                fill={LIGHT}
              >
                {shortPlanLabel(shape)}
              </text>
            ) : null}
          </g>
        ))}

      {/* Existing structures. Hatched, because that is what a structure is. */}
      {structures.map(structure => (
        <g key={structure.id}>
          <rect
            x={structure.x}
            y={structure.y}
            width={structure.width}
            height={structure.height}
            fill="url(#pf-hatch)"
            stroke={INK}
            strokeWidth={1.6 * k}
          />
          <text
            x={structure.x + structure.width / 2}
            y={structure.y + structure.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={12 * k}
            fontWeight={600}
            fill={INK}
          >
            {structure.label.toUpperCase()}
          </text>
        </g>
      ))}

      {/* Equipment pad and the run back to the water. */}
      {pads.map(pad => (
        <g key={pad.id}>
          <rect
            x={pad.x}
            y={pad.y}
            width={pad.width}
            height={pad.height}
            fill="url(#pf-pad-hatch)"
            stroke={INK}
            strokeWidth={1.2 * k}
          />
          <text
            x={pad.x + pad.width / 2}
            y={pad.y - 4 * k}
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={10 * k}
            fill={INK}
          >
            EQUIP. PAD
          </text>
          {water ? (
            <line
              x1={pad.x + pad.width / 2}
              y1={pad.y + pad.height / 2}
              x2={water.x + water.width / 2}
              y2={water.y + water.height / 2}
              stroke={INK}
              strokeWidth={1.2 * k}
              strokeDasharray={`${10 * k} ${6 * k}`}
            />
          ) : null}
        </g>
      ))}

      {/* Pools, spas and everything else that is not scenery. */}
      {ordered
        .filter(shape => !isDeckKind(shape.kind) && !isSiteStencil(shape))
        .map(shape => {
          const wet = isRegulated(shape)
          return (
            <g key={shape.id}>
              <rect
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rx={shape.displayHint?.poolShape === 'ellipse' ? Math.min(shape.width, shape.height) / 2 : 0}
                fill={wet ? '#E8F1F7' : '#FFFFFF'}
                stroke={INK}
                strokeWidth={wet ? 2 * k : 1.2 * k}
              />
              {labelFits(shortPlanLabel(shape), shape.width, 11 * k) ? (
                <text
                  x={shape.x + shape.width / 2}
                  y={shape.y + shape.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fontSize={11 * k}
                  fontWeight={600}
                  fill={INK}
                >
                  {shortPlanLabel(shape)}
                </text>
              ) : null}
            </g>
          )
        })}

      {/* Centre lines: what a crew sets out from. */}
      {variant === 'construction' && primaryPool ? (
        <g>
          <line
            x1={primaryPool.x - 30 * k}
            y1={primaryPool.y + primaryPool.height / 2}
            x2={primaryPool.x + primaryPool.width + 30 * k}
            y2={primaryPool.y + primaryPool.height / 2}
            stroke={LIGHT}
            strokeWidth={1 * k}
            strokeDasharray={`${18 * k} ${6 * k} ${3 * k} ${6 * k}`}
          />
          <line
            x1={primaryPool.x + primaryPool.width / 2}
            y1={primaryPool.y - 30 * k}
            x2={primaryPool.x + primaryPool.width / 2}
            y2={primaryPool.y + primaryPool.height + 30 * k}
            stroke={LIGHT}
            strokeWidth={1 * k}
            strokeDasharray={`${18 * k} ${6 * k} ${3 * k} ${6 * k}`}
          />
        </g>
      ) : null}

      {/* Required setback envelope — drawn only where a limit was entered. */}
      {envelope && envelope.width > 0 && envelope.height > 0 ? (
        <rect
          x={envelope.x}
          y={envelope.y}
          width={envelope.width}
          height={envelope.height}
          fill="none"
          stroke={LIGHT}
          strokeWidth={1.4 * k}
          strokeDasharray={`${14 * k} ${8 * k}`}
        />
      ) : null}

      {/* The property line, heaviest thing on the sheet. */}
      {lot ? (
        <g>
          <rect
            x={lot.x}
            y={lot.y}
            width={lot.width}
            height={lot.height}
            fill="none"
            stroke={INK}
            strokeWidth={3.2 * k}
          />
          <text
            x={lot.x + 6 * k}
            y={lot.y - 6 * k}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={11 * k}
            fontWeight={700}
            letterSpacing={1 * k}
            fill={INK}
          >
            PROPERTY LINE
          </text>
          <DimH
            x1={lot.x}
            x2={lot.x + lot.width}
            y={lot.y + lot.height + 34 * k}
            from={lot.y + lot.height}
            to={lot.y + lot.height}
            k={k}
          />
          <DimV
            y1={lot.y}
            y2={lot.y + lot.height}
            x={lot.x - 34 * k}
            from={lot.x}
            to={lot.x}
            k={k}
          />
        </g>
      ) : null}

      {/* Setback dimensions: water edge to lot line, on all four sides. */}
      {lot && water ? (
        <g>
          <DimV
            y1={lot.y}
            y2={water.y}
            x={water.x + water.width * 0.25}
            from={lot.x}
            to={water.x}
            k={k}
          />
          <DimV
            y1={water.y + water.height}
            y2={lot.y + lot.height}
            x={water.x + water.width * 0.75}
            from={water.x}
            to={lot.x}
            k={k}
          />
          <DimH
            x1={lot.x}
            x2={water.x}
            y={water.y + water.height * 0.25}
            from={lot.y}
            to={water.y}
            k={k}
          />
          <DimH
            x1={water.x + water.width}
            x2={lot.x + lot.width}
            y={water.y + water.height * 0.75}
            from={water.y}
            to={lot.y}
            k={k}
          />
        </g>
      ) : null}

      {/* Pool overall dimensions. */}
      {primaryPool ? (
        <g>
          <DimH
            x1={primaryPool.x}
            x2={primaryPool.x + primaryPool.width}
            y={primaryPool.y + primaryPool.height + 22 * k}
            from={primaryPool.y + primaryPool.height}
            to={primaryPool.y + primaryPool.height}
            k={k}
          />
          <DimV
            y1={primaryPool.y}
            y2={primaryPool.y + primaryPool.height}
            x={primaryPool.x + primaryPool.width + 22 * k}
            from={primaryPool.x + primaryPool.width}
            to={primaryPool.x + primaryPool.width}
            k={k}
          />
        </g>
      ) : null}

      {/* Water to the nearest structure, which is the dimension a plan checker
          looks for after the setbacks. */}
      {water && structures[0] ? <StructureDim water={water} structures={structures} k={k} /> : null}

      <NorthArrow x={view.x + view.width - 46 * k} y={view.y + 52 * k} k={k} />
      <ScaleBar
        x={view.x + 34 * k}
        y={view.y + view.height - 26 * k}
        k={k}
        ftPerInch={ftPerInch}
      />
    </svg>
  )
}

/** The clear distance to whichever structure is closest. */
function StructureDim({
  water,
  structures,
  k,
}: {
  water: Rect
  structures: Rect[]
  k: number
}) {
  let nearest: Rect | null = null
  let best = Infinity
  for (const structure of structures) {
    const dx = Math.max(structure.x - (water.x + water.width), water.x - (structure.x + structure.width), 0)
    const dy = Math.max(structure.y - (water.y + water.height), water.y - (structure.y + structure.height), 0)
    const distance = Math.hypot(dx, dy)
    if (distance < best) {
      best = distance
      nearest = structure
    }
  }
  if (!nearest) return null

  const above = nearest.y + nearest.height <= water.y
  const below = nearest.y >= water.y + water.height
  const x = water.x + water.width * 0.5

  if (above) {
    return <DimV y1={nearest.y + nearest.height} y2={water.y} x={x} from={nearest.x} to={water.x} k={k} />
  }
  if (below) {
    return (
      <DimV y1={water.y + water.height} y2={nearest.y} x={x} from={water.x} to={nearest.x} k={k} />
    )
  }
  const left = nearest.x + nearest.width <= water.x
  const y = water.y + water.height * 0.5
  return left ? (
    <DimH x1={nearest.x + nearest.width} x2={water.x} y={y} from={nearest.y} to={water.y} k={k} />
  ) : (
    <DimH x1={water.x + water.width} x2={nearest.x} y={y} from={water.y} to={nearest.y} k={k} />
  )
}
