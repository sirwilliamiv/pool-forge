// The lot and what stands on it, read off the drawing.
//
// Setbacks used to be measured against a wall hardcoded at y = -336 inches and
// a lot hardcoded at 100 ft by 100 ft. Neither existed on screen, so the
// inspector reported a distance to a house nobody had placed and the site plan
// printed a dash in the box a plan checker reads first. The numbers were
// invented in one place and missing in the other, which is the worst possible
// pair.
//
// So both are ordinary objects in the drawing now: the property line is a
// `symbol.property-line` stencil sized to the lot, and a structure is a
// `site.house-wall` stencil. They live in `Drawing.rootJson.shapes` with
// everything else, which means they already load, save, undo, redo and survive
// a reload — no new persistence, no migration — and they are visible, movable
// and deletable like any other object. Nothing here invents a number: when
// something has not been placed, the answer is that it has not been placed.

import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

/** Catalogue ids that carry site meaning. */
export const PROPERTY_LINE_STENCIL = 'symbol.property-line'
export const STRUCTURE_STENCIL = 'site.house-wall'
export const EQUIPMENT_PAD_STENCIL = 'symbol.equipment-pad'

/** Which lot edge a distance is measured to. */
export type LotEdge = 'front' | 'rear' | 'left' | 'right'

/**
 * The zoning limits for this lot, in feet.
 *
 * Carried by the property line itself rather than by the project, because they
 * describe the boundary that was drawn: move to another lot and they move with
 * it. Every field is optional because a builder who has not looked them up yet
 * must not have numbers put in their mouth.
 */
export interface LotLimits {
  frontFt?: number
  sideFt?: number
  rearFt?: number
  easements?: string
}

export interface PropertyLine {
  id: string
  /** Inches, drawing coordinates. Front is -y, rear is +y. */
  x: number
  y: number
  width: number
  height: number
  limits: LotLimits
}

export interface Structure {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface SiteContext {
  propertyLine: PropertyLine | null
  structures: Structure[]
  equipmentPads: Structure[]
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function stencilIdOf(shape: Shape): string | null {
  if (shape.kind !== ShapeKind.STENCIL) return null
  return shape.stencilId
}

/** Everything a setback is measured from: the water, not the lawn. */
export function isRegulated(shape: Shape): boolean {
  return (
    shape.kind === ShapeKind.RECTANGLE_POOL ||
    shape.kind === ShapeKind.POLYGON_POOL ||
    shape.kind === ShapeKind.SPA
  )
}

/**
 * The lot, if one has been drawn.
 *
 * The first property line in the drawing wins. A second one is a second lot,
 * which is not a thing, so it is ignored rather than averaged into nonsense.
 */
export function findPropertyLine(shapes: Shape[]): PropertyLine | null {
  for (const shape of shapes) {
    if (shape.hidden) continue
    if (stencilIdOf(shape) !== PROPERTY_LINE_STENCIL) continue
    return {
      id: shape.id,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      limits: readLimits(shape),
    }
  }
  return null
}

/** Zoning limits stored on the property line, tolerating anything else. */
export function readLimits(shape: Shape): LotLimits {
  const raw = (shape.displayHint as { lot?: unknown } | undefined)?.lot
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const limits: LotLimits = {}
  if (typeof obj.frontFt === 'number' && Number.isFinite(obj.frontFt)) limits.frontFt = obj.frontFt
  if (typeof obj.sideFt === 'number' && Number.isFinite(obj.sideFt)) limits.sideFt = obj.sideFt
  if (typeof obj.rearFt === 'number' && Number.isFinite(obj.rearFt)) limits.rearFt = obj.rearFt
  if (typeof obj.easements === 'string' && obj.easements.trim() !== '') {
    limits.easements = obj.easements.trim()
  }
  return limits
}

function structuresWith(shapes: Shape[], stencilId: string, fallbackLabel: string): Structure[] {
  const found: Structure[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue
    if (stencilIdOf(shape) !== stencilId) continue
    found.push({
      id: shape.id,
      label: shape.name?.trim() || fallbackLabel,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rotation: shape.rotation,
    })
  }
  return found
}

export function findStructures(shapes: Shape[]): Structure[] {
  return structuresWith(shapes, STRUCTURE_STENCIL, 'House')
}

export function findEquipmentPads(shapes: Shape[]): Structure[] {
  return structuresWith(shapes, EQUIPMENT_PAD_STENCIL, 'Equipment pad')
}

export function readSite(shapes: Shape[]): SiteContext {
  return {
    propertyLine: findPropertyLine(shapes),
    structures: findStructures(shapes),
    equipmentPads: findEquipmentPads(shapes),
  }
}

/** Clear distance between two axis-aligned boxes, in inches. Zero if they touch. */
export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0)
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0)
  return Math.hypot(dx, dy)
}

export interface StructureDistance {
  structure: Structure
  /** Inches, edge to edge. */
  distanceIn: number
}

/** The nearest placed structure to a shape, or null when none has been placed. */
export function nearestStructure(shape: Shape, shapes: Shape[]): StructureDistance | null {
  let best: StructureDistance | null = null
  for (const structure of findStructures(shapes)) {
    if (structure.id === shape.id) continue
    const distanceIn = gapBetween(shape, structure)
    if (!best || distanceIn < best.distanceIn) best = { structure, distanceIn }
  }
  return best
}

export interface EdgeSetback {
  edge: LotEdge
  /** Inches from the shape's edge to the lot line. Negative is over the line. */
  distanceIn: number
  /** Inches the code requires here, or null when nobody has entered it. */
  requiredIn: number | null
  /** Only false when a requirement exists and is not met. Never a guess. */
  compliant: boolean | null
}

/**
 * Where a shape sits inside the lot.
 *
 * Front is the -y edge and rear is +y, which is the convention the rest of the
 * app already draws with (the house sits north of the pool, at negative y).
 */
export function edgeSetbacks(shape: Rect, lot: PropertyLine): EdgeSetback[] {
  const limits = lot.limits
  const required = (ft: number | undefined): number | null =>
    typeof ft === 'number' && Number.isFinite(ft) ? ft * 12 : null

  const raw: Array<{ edge: LotEdge; distanceIn: number; requiredIn: number | null }> = [
    { edge: 'front', distanceIn: shape.y - lot.y, requiredIn: required(limits.frontFt) },
    {
      edge: 'rear',
      distanceIn: lot.y + lot.height - (shape.y + shape.height),
      requiredIn: required(limits.rearFt),
    },
    { edge: 'left', distanceIn: shape.x - lot.x, requiredIn: required(limits.sideFt) },
    {
      edge: 'right',
      distanceIn: lot.x + lot.width - (shape.x + shape.width),
      requiredIn: required(limits.sideFt),
    },
  ]

  return raw.map(entry => ({
    ...entry,
    compliant: entry.requiredIn === null ? null : entry.distanceIn >= entry.requiredIn,
  }))
}

/**
 * The most constraining edge: the one closest to failing its requirement, or —
 * when no requirement has been entered — simply the closest.
 */
export function worstSetback(setbacks: EdgeSetback[]): EdgeSetback | null {
  let worst: EdgeSetback | null = null
  for (const candidate of setbacks) {
    if (!worst) {
      worst = candidate
      continue
    }
    const slack = (s: EdgeSetback): number => s.distanceIn - (s.requiredIn ?? 0)
    if (slack(candidate) < slack(worst)) worst = candidate
  }
  return worst
}

/** The box the pools and spas occupy together, or null when there are none. */
export function regulatedBounds(shapes: Shape[]): Rect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  for (const shape of shapes) {
    if (shape.hidden || !isRegulated(shape)) continue
    found = true
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  if (!found) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export interface SiteSetbackReport {
  /** Null when no property line has been drawn — which is not the same as zero. */
  lot: PropertyLine | null
  /** Null when there is no pool or spa to measure. */
  edges: EdgeSetback[] | null
  structures: Structure[]
  equipmentPads: Structure[]
  /** Distance from the pool/spa envelope to the nearest structure, in inches. */
  toStructureIn: number | null
  nearestStructureLabel: string | null
}

/**
 * Everything the site plan prints about setbacks, derived from one reading of
 * the drawing so the sheet and the inspector cannot disagree.
 */
export function siteSetbackReport(shapes: Shape[]): SiteSetbackReport {
  const lot = findPropertyLine(shapes)
  const water = regulatedBounds(shapes)
  const structures = findStructures(shapes)

  let toStructureIn: number | null = null
  let nearestStructureLabel: string | null = null
  if (water) {
    for (const structure of structures) {
      const distance = gapBetween(water, structure)
      if (toStructureIn === null || distance < toStructureIn) {
        toStructureIn = distance
        nearestStructureLabel = structure.label
      }
    }
  }

  return {
    lot,
    edges: lot && water ? edgeSetbacks(water, lot) : null,
    structures,
    equipmentPads: findEquipmentPads(shapes),
    toStructureIn,
    nearestStructureLabel,
  }
}

/**
 * A lot that fits what is already drawn, for the "place a property line"
 * affordance.
 *
 * A boundary the user then drags is far better than a boundary they have to
 * invent from nothing, and one that already contains the pool is the only
 * sensible starting guess.
 */
export function suggestedLot(shapes: Shape[]): Rect {
  const margin = 25 * 12
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  for (const shape of shapes) {
    if (shape.hidden) continue
    if (stencilIdOf(shape) === PROPERTY_LINE_STENCIL) continue
    found = true
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  if (!found) {
    // 80 ft by 110 ft, centred on the origin: an ordinary suburban lot, and
    // labelled on screen as a placeholder to be dragged onto the survey.
    return { x: -40 * 12, y: -55 * 12, width: 80 * 12, height: 110 * 12 }
  }
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  }
}
