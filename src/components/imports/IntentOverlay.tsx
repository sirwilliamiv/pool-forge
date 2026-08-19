'use client'

import { confidenceBand, type DesignIntent, type Footprint } from '@/modules/imports/intent'
import { confidenceFor } from './gates'
import {
  calibrationPxDistance,
  dimensionDisagrees,
  footprintToPolygonPoints,
  gridOverlay,
  poolDimensionLines,
  type CalibrationPoint,
} from './overlay-geometry'

// The overlay is what makes an extracted number auditable: every line drawn
// here is the thing the number was read off. It shares one coordinate frame
// with the raster (`viewBox` in source pixels), so the browser applies the
// same zoom and pan transform to both and registration is structural rather
// than something that has to be kept in sync.
//
// Strokes use `vector-effect: non-scaling-stroke` and labels counter-scale by
// `1 / zoom`, so a hairline stays a hairline and a label stays readable at any
// magnification.

export interface OverlayToggleState {
  pool: boolean
  dimensions: boolean
  grid: boolean
  deck: boolean
  enclosure: boolean
  site: boolean
  calibration: boolean
}

export const DEFAULT_OVERLAY_TOGGLES: OverlayToggleState = {
  pool: true,
  dimensions: true,
  grid: true,
  deck: true,
  enclosure: false,
  site: false,
  calibration: true,
}

export const OVERLAY_TOGGLE_LABELS: Record<keyof OverlayToggleState, string> = {
  pool: 'Pool polygon',
  dimensions: 'Dimensions',
  grid: 'Derived grid',
  deck: 'Deck',
  enclosure: 'Enclosure',
  site: 'Site',
  calibration: 'Calibration',
}

const BAND_STROKE: Record<'high' | 'medium' | 'low', string> = {
  high: '#059669',
  medium: '#F59E0B',
  low: '#EF4444',
}

export interface IntentOverlayProps {
  intent: DesignIntent
  widthPx: number
  heightPx: number
  zoom: number
  toggles: OverlayToggleState
  calibrationPoints: CalibrationPoint[]
  calibrationLabel: string | null
}

export function IntentOverlay({
  intent,
  widthPx,
  heightPx,
  zoom,
  toggles,
  calibrationPoints,
  calibrationLabel,
}: IntentOverlayProps) {
  const ppi = intent.scale.pixelsPerInch
  const grid = toggles.grid ? gridOverlay(widthPx, heightPx, ppi) : null
  const dimensionLines = toggles.dimensions ? poolDimensionLines(intent, ppi) : []
  const counter = zoom > 0 ? 1 / zoom : 1
  const labelFont = 11

  return (
    <svg
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      width={widthPx}
      height={heightPx}
      role="img"
      aria-label="Detected geometry drawn over the source image"
      className="pointer-events-none absolute inset-0"
    >
      {grid && !grid.tooDense ? (
        <g stroke="#0E9DE5" strokeOpacity={0.28} vectorEffect="non-scaling-stroke">
          {grid.vertical.map((x) => (
            <line key={`gv-${x}`} x1={x} y1={0} x2={x} y2={heightPx} vectorEffect="non-scaling-stroke" />
          ))}
          {grid.horizontal.map((y) => (
            <line key={`gh-${y}`} x1={0} y1={y} x2={widthPx} y2={y} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ) : null}

      {toggles.site ? (
        <>
          <FootprintPath
            footprint={intent.site.propertyBoundary}
            ppi={ppi}
            stroke="#64748B"
            fill="none"
            dash="10 8"
          />
          <FootprintPath
            footprint={intent.site.houseFootprint}
            ppi={ppi}
            stroke="#475569"
            fill="rgba(71,85,105,0.12)"
          />
        </>
      ) : null}

      {toggles.deck ? (
        <FootprintPath
          footprint={intent.deck.footprint}
          ppi={ppi}
          stroke="#0F766E"
          fill="rgba(15,118,110,0.10)"
          dash="6 5"
        />
      ) : null}

      {toggles.enclosure ? (
        <FootprintPath
          footprint={intent.enclosure.footprint}
          ppi={ppi}
          stroke="#7C3AED"
          fill="rgba(124,58,237,0.08)"
          dash="4 6"
        />
      ) : null}

      {/*
        Pre-calibration fallback. The extractor reports the outline in
        normalized image coordinates, which need no scale, so the detection is
        visible while `pixelsPerInch` is still null. Without this the screen is
        blank until calibration and the user is asked to trust an extraction
        they cannot see. Dashed and amber to read as provisional.
      */}
      {toggles.pool && (intent.pool.footprint === null || ppi === null) && intent.imageSpace &&
      intent.imageSpace.poolPolygon.length >= 3 ? (
        <polygon
          points={intent.imageSpace.poolPolygon
            .map((p) => `${(p.x * widthPx).toFixed(2)},${(p.y * heightPx).toFixed(2)}`)
            .join(' ')}
          fill="rgba(217,119,6,0.14)"
          stroke="#D97706"
          strokeWidth={2 * counter}
          strokeDasharray={`${8 * counter} ${6 * counter}`}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {toggles.pool && intent.pool.footprint && ppi !== null ? (
        <>
          <FootprintPath
            footprint={intent.pool.footprint}
            ppi={ppi}
            stroke="#0E9DE5"
            fill="rgba(14,157,229,0.18)"
          />
          {intent.pool.footprint.points.map((point, index) => (
            <circle
              key={`v-${index}`}
              cx={point.x * ppi}
              cy={point.y * ppi}
              r={3.5 * counter}
              fill="#ffffff"
              stroke="#0284C7"
              strokeWidth={1.5 * counter}
            />
          ))}
        </>
      ) : null}

      {dimensionLines.map((line) => {
        const score = confidenceFor(intent, line.path)
        const band = score === null ? 'medium' : confidenceBand(score)
        const stroke = BAND_STROKE[band]
        const disagrees = dimensionDisagrees(line)
        const tickHalf = 6 * counter
        return (
          <g key={line.id}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {line.axis === 'horizontal' ? (
              <>
                <line
                  x1={line.x1}
                  y1={line.y1 - tickHalf}
                  x2={line.x1}
                  y2={line.y1 + tickHalf}
                  stroke={stroke}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={line.x2}
                  y1={line.y2 - tickHalf}
                  x2={line.x2}
                  y2={line.y2 + tickHalf}
                  stroke={stroke}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              <>
                <line
                  x1={line.x1 - tickHalf}
                  y1={line.y1}
                  x2={line.x1 + tickHalf}
                  y2={line.y1}
                  stroke={stroke}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={line.x2 - tickHalf}
                  y1={line.y2}
                  x2={line.x2 + tickHalf}
                  y2={line.y2}
                  stroke={stroke}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            <g transform={`translate(${line.labelX} ${line.labelY}) scale(${counter})`}>
              <rect
                x={-30}
                y={-9}
                width={60}
                height={18}
                rx={4}
                fill="#ffffff"
                stroke={stroke}
                strokeWidth={1}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelFont}
                fontWeight={600}
                fill={stroke}
              >
                {line.label}
              </text>
              {disagrees ? (
                <text
                  x={0}
                  y={17}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelFont - 2}
                  fill="#B45309"
                >
                  {`measures ${line.measuredFt.toFixed(1)} ft`}
                </text>
              ) : null}
            </g>
          </g>
        )
      })}

      {toggles.calibration && calibrationPoints.length > 0 ? (
        <g>
          {calibrationPoints.length === 2 &&
          calibrationPoints[0] !== undefined &&
          calibrationPoints[1] !== undefined ? (
            <line
              x1={calibrationPoints[0].x}
              y1={calibrationPoints[0].y}
              x2={calibrationPoints[1].x}
              y2={calibrationPoints[1].y}
              stroke="#0284C7"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {calibrationPoints.map((point, index) => (
            <g key={`cal-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={5 * counter}
                fill="#0284C7"
                stroke="#ffffff"
                strokeWidth={2 * counter}
              />
              <g transform={`translate(${point.x} ${point.y}) scale(${counter})`}>
                <text
                  x={10}
                  y={-8}
                  fontSize={labelFont}
                  fontWeight={600}
                  fill="#0284C7"
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {index === 0 ? 'A' : 'B'}
                </text>
              </g>
            </g>
          ))}
          {calibrationLabel !== null &&
          calibrationPoints.length === 2 &&
          calibrationPoints[0] !== undefined &&
          calibrationPoints[1] !== undefined ? (
            <g
              transform={`translate(${(calibrationPoints[0].x + calibrationPoints[1].x) / 2} ${
                (calibrationPoints[0].y + calibrationPoints[1].y) / 2
              }) scale(${counter})`}
            >
              <text
                x={0}
                y={-10}
                textAnchor="middle"
                fontSize={labelFont}
                fontWeight={600}
                fill="#0284C7"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {calibrationLabel}
              </text>
            </g>
          ) : null}
        </g>
      ) : null}
    </svg>
  )
}

function FootprintPath({
  footprint,
  ppi,
  stroke,
  fill,
  dash,
}: {
  footprint: Footprint | null
  ppi: number | null
  stroke: string
  fill: string
  dash?: string
}) {
  if (!footprint) return null
  const points = footprintToPolygonPoints(footprint, ppi)
  if (points === null) return null
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeWidth={2}
      strokeDasharray={dash ?? undefined}
      vectorEffect="non-scaling-stroke"
    />
  )
}

/** Human-readable span for the calibration label, from the two clicks. */
export function calibrationSpanLabel(
  points: CalibrationPoint[],
  realInches: number | null,
): string | null {
  const a = points[0]
  const b = points[1]
  if (!a || !b) return null
  const px = calibrationPxDistance(a, b)
  if (realInches === null) return `${Math.round(px)} px`
  const feet = realInches / 12
  const feetLabel = Number.isInteger(feet) ? `${feet} ft` : `${feet.toFixed(1)} ft`
  return `${Math.round(px)} px = ${feetLabel}`
}
