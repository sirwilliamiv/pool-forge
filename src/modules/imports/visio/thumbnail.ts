// Rings to a small standalone SVG for the preview and the library card. Pure.
//
// Colours come from the file, so they are validated here and replaced with the
// defaults when they are not plain six-digit hex: the string is rendered as
// markup and must not carry anything else.

import { polygonBounds } from '@/lib/geometry/polygon-footprint'
import { DEFAULT_FILL, DEFAULT_STROKE, type Ring } from './types'

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const MIN_VIEWBOX_SIDE = 0.05
const DECIMALS = 4
const SVG_NS = 'http://www.w3.org/2000/svg'
const STROKE_WIDTH = 0.01

function fmt(value: number): string {
  const s = value.toFixed(DECIMALS).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

function safeColor(value: string, fallback: string): string {
  return HEX_COLOR.test(value) ? value : fallback
}

export function thumbnailSvg(rings: Ring[], fill: string, stroke: string): string {
  const b = polygonBounds(rings.flat())
  let { minX, minY, width, height } = b
  if (width < MIN_VIEWBOX_SIDE) {
    minX -= (MIN_VIEWBOX_SIDE - width) / 2
    width = MIN_VIEWBOX_SIDE
  }
  if (height < MIN_VIEWBOX_SIDE) {
    minY -= (MIN_VIEWBOX_SIDE - height) / 2
    height = MIN_VIEWBOX_SIDE
  }

  const d = rings
    .filter(ring => ring.length > 0)
    .map(ring => ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join(' ') + ' Z')
    .join(' ')

  return (
    `<svg xmlns="${SVG_NS}" viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}">` +
    `<path d="${d}" fill="${safeColor(fill, DEFAULT_FILL)}" stroke="${safeColor(stroke, DEFAULT_STROKE)}"` +
    ` fill-rule="evenodd" stroke-width="${STROKE_WIDTH}" vector-effect="non-scaling-stroke"/>` +
    `</svg>`
  )
}
