import type { Shape, ShapeKind } from '@/modules/editor/state/shapes'

export interface SvgViewport {
  x: number
  y: number
  width: number
  height: number
}

export interface SvgFill {
  fill: string
  stroke: string
  dash?: string
}

const PALETTE: Record<ShapeKind, SvgFill> = {
  'rectangle-pool': { fill: '#3b82f6', stroke: '#1e40af' },
  'concrete-deck': { fill: '#cbd5e1', stroke: '#475569' },
  'paver-deck': { fill: '#a78bfa', stroke: '#5b21b6' },
  'grass-area': { fill: '#86efac', stroke: '#166534' },
  'sun-shelf': { fill: '#bae6fd', stroke: '#0369a1' },
  bench: { fill: '#d6b88e', stroke: '#7c5e2a' },
  spa: { fill: '#1d4ed8', stroke: '#1e3a8a', dash: '6 4' },
}

export function fillForKind(kind: ShapeKind): SvgFill {
  return PALETTE[kind]
}

const PAD_INCHES = 24
const DEFAULT_VIEWPORT: SvgViewport = { x: 0, y: 0, width: 600, height: 400 }

export function shapesBoundingBox(shapes: Shape[]): SvgViewport {
  const visible = shapes.filter((s) => !s.hidden)
  if (visible.length === 0) return DEFAULT_VIEWPORT

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const s of visible) {
    minX = Math.min(minX, s.x)
    minY = Math.min(minY, s.y)
    maxX = Math.max(maxX, s.x + s.width)
    maxY = Math.max(maxY, s.y + s.height)
  }

  return {
    x: minX - PAD_INCHES,
    y: minY - PAD_INCHES,
    width: maxX - minX + PAD_INCHES * 2,
    height: maxY - minY + PAD_INCHES * 2,
  }
}

export function labelForShape(shape: Shape): string {
  const wFt = (shape.width / 12).toFixed(1).replace(/\.0$/, '')
  const hFt = (shape.height / 12).toFixed(1).replace(/\.0$/, '')
  switch (shape.kind) {
    case 'rectangle-pool':
      return `Pool ${wFt}×${hFt} ft`
    case 'concrete-deck':
      return `Concrete deck ${wFt}×${hFt} ft`
    case 'paver-deck':
      return `Paver deck ${wFt}×${hFt} ft`
    case 'grass-area':
      return `Grass ${wFt}×${hFt} ft`
    case 'sun-shelf':
      return `Sun shelf ${wFt}×${hFt}`
    case 'bench':
      return `Bench ${wFt} ft`
    case 'spa':
      return `Spa ${wFt}×${hFt}`
  }
}
