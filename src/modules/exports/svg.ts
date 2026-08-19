import { ShapeKind } from '@prisma/client'
import type { Shape } from '@/modules/editor/state/shapes'
import { isStencil } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'

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
  [ShapeKind.RECTANGLE_POOL]: { fill: '#3b82f6', stroke: '#1e40af' },
  [ShapeKind.POLYGON_POOL]: { fill: '#3b82f6', stroke: '#1e40af' },
  [ShapeKind.CONCRETE_DECK]: { fill: '#cbd5e1', stroke: '#475569' },
  [ShapeKind.PAVER_DECK]: { fill: '#a78bfa', stroke: '#5b21b6' },
  [ShapeKind.GRASS_AREA]: { fill: '#86efac', stroke: '#166534' },
  [ShapeKind.SUN_SHELF]: { fill: '#bae6fd', stroke: '#0369a1' },
  [ShapeKind.BENCH]: { fill: '#d6b88e', stroke: '#7c5e2a' },
  [ShapeKind.SPA]: { fill: '#1d4ed8', stroke: '#1e3a8a', dash: '6 4' },
  [ShapeKind.STENCIL]: { fill: '#e5e7eb', stroke: '#374151' },
}

export function fillForKind(kind: ShapeKind): SvgFill {
  return PALETTE[kind]
}

export function fillForShape(shape: Shape): SvgFill {
  if (isStencil(shape)) {
    const def = getStencil(shape.stencilId)
    if (def) return { fill: def.defaultFill, stroke: def.defaultStroke }
  }
  return PALETTE[shape.kind]
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
    case ShapeKind.RECTANGLE_POOL:
      return `Pool ${wFt}×${hFt} ft`
    case ShapeKind.POLYGON_POOL:
      return `Freeform pool ${wFt}×${hFt} ft`
    case ShapeKind.CONCRETE_DECK:
      return `Concrete deck ${wFt}×${hFt} ft`
    case ShapeKind.PAVER_DECK:
      return `Paver deck ${wFt}×${hFt} ft`
    case ShapeKind.GRASS_AREA:
      return `Grass ${wFt}×${hFt} ft`
    case ShapeKind.SUN_SHELF:
      return `Sun shelf ${wFt}×${hFt}`
    case ShapeKind.BENCH:
      return `Bench ${wFt} ft`
    case ShapeKind.SPA:
      return `Spa ${wFt}×${hFt}`
    case ShapeKind.STENCIL: {
      const def = getStencil((shape as { stencilId?: string }).stencilId ?? '')
      return def ? `${def.name} ${wFt}×${hFt}` : `Stencil ${wFt}×${hFt}`
    }
  }
}
