// Setbacks measured against something that exists.
//
// The inspector used to read a distance to a house wall hardcoded at
// y = -336 inches and a setback against a lot hardcoded at 100 ft by 100 ft.
// Neither was in the drawing, neither could be moved, and the site plan — the
// document that legally needs those numbers — printed a dash for all of them.
// The app invented a number on screen and left the sheet blank.
//
// These tests hold both halves to the same rule: measure what is placed, and
// say plainly when nothing is.

import { ShapeKind } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  edgeSetbacks,
  findPropertyLine,
  findStructures,
  siteSetbackReport,
  suggestedLot,
  PROPERTY_LINE_STENCIL,
  STRUCTURE_STENCIL,
} from '@/modules/editor/site/model'
import { parseDrawingPayload, serializeDrawingPayload } from '@/modules/editor/drawing-payload'
import { distanceToHouse, distanceToSetback } from '@/modules/measurements/engine'
import type { Shape } from '@/modules/editor/state/shapes'

function base(id: string, x: number, y: number, width: number, height: number) {
  return { id, x, y, width, height, rotation: 0, zIndex: 1, locked: false, hidden: false }
}

/** A 25 ft × 12 ft pool with its top-left corner 20 ft right, 20 ft back. */
function pool(x = 20 * 12, y = 20 * 12): Shape {
  return {
    ...base('pool-1', x, y, 25 * 12, 12 * 12),
    kind: ShapeKind.RECTANGLE_POOL,
    depthShallow: 3,
    depthDeep: 5,
  }
}

/** An 80 ft × 110 ft lot with its front-left corner at the origin. */
function lot(limits?: { frontFt?: number; sideFt?: number; rearFt?: number; easements?: string }): Shape {
  const shape: Shape = {
    ...base('lot-1', 0, 0, 80 * 12, 110 * 12),
    kind: ShapeKind.STENCIL,
    stencilId: PROPERTY_LINE_STENCIL,
  }
  if (limits) shape.displayHint = { lot: limits }
  return shape
}

function house(x = 10 * 12, y = -24 * 12, width = 40 * 12, height = 24 * 12): Shape {
  return {
    ...base('house-1', x, y, width, height),
    kind: ShapeKind.STENCIL,
    stencilId: STRUCTURE_STENCIL,
    name: 'House',
  }
}

describe('nothing placed', () => {
  it('reports no structure rather than a distance to an invisible wall', () => {
    // The exact defect: `26' 5" — south face`, measured to a house nobody drew.
    expect(distanceToHouse(pool(), [pool()])).toBe('No structure placed')
  })

  it('reports no property line rather than a setback against an invented lot', () => {
    const info = distanceToSetback(pool(), [pool()])
    expect(info.known).toBe(false)
    expect(info.violated).toBe(false)
    expect(info.required).toContain('no property line')
  })

  it('the report says which of the two is missing, separately', () => {
    const report = siteSetbackReport([pool()])
    expect(report.lot).toBeNull()
    expect(report.edges).toBeNull()
    expect(report.structures).toEqual([])
    expect(report.toStructureIn).toBeNull()
  })
})

describe('a property line that was actually drawn', () => {
  it('is found in the drawing like any other object', () => {
    const found = findPropertyLine([pool(), lot()])
    expect(found?.id).toBe('lot-1')
    expect(found?.width).toBe(80 * 12)
  })

  it('measures each edge from the water to the lot line', () => {
    const shapes = [lot(), pool()]
    const report = siteSetbackReport(shapes)
    const byEdge = Object.fromEntries((report.edges ?? []).map(e => [e.edge, e.distanceIn]))

    // Pool spans x 20→45 ft, y 20→32 ft inside an 80 × 110 ft lot at the origin.
    expect(byEdge.front).toBe(20 * 12)
    expect(byEdge.left).toBe(20 * 12)
    expect(byEdge.right).toBe((80 - 45) * 12)
    expect(byEdge.rear).toBe((110 - 32) * 12)
  })

  it('claims nothing about compliance until a limit has been entered', () => {
    const edges = edgeSetbacks(pool(), findPropertyLine([lot()])!)
    for (const edge of edges) {
      expect(edge.requiredIn).toBeNull()
      expect(edge.compliant).toBeNull()
    }
  })

  it('compares against the limits a builder entered, and only those', () => {
    const edges = edgeSetbacks(pool(), findPropertyLine([lot({ sideFt: 5, rearFt: 7.5 })])!)
    const byEdge = Object.fromEntries(edges.map(e => [e.edge, e]))
    expect(byEdge.left?.requiredIn).toBe(60)
    expect(byEdge.left?.compliant).toBe(true)
    expect(byEdge.rear?.requiredIn).toBe(90)
    expect(byEdge.rear?.compliant).toBe(true)
    // Front was never entered, so nothing is claimed about it.
    expect(byEdge.front?.requiredIn).toBeNull()
    expect(byEdge.front?.compliant).toBeNull()
  })

  it('says so when the selected object is the property line itself', () => {
    const shapes = [lot(), pool()]
    const info = distanceToSetback(shapes[0]!, shapes)
    expect(info.known).toBe(false)
    expect(info.required).toBe('this is the property line')
  })

  it('calls a pool over the line what it is', () => {
    // Pool pushed to x = 78 ft on an 80 ft lot: 25 ft of it is off the property.
    const shapes = [lot({ sideFt: 5 }), pool(78 * 12, 20 * 12)]
    const info = distanceToSetback(shapes[1]!, shapes)
    expect(info.known).toBe(true)
    expect(info.violated).toBe(true)
    expect(info.distance).toContain('over')
  })

  it('moves with the property line, because the line is a real object', () => {
    const moved = lot()
    moved.x = 10 * 12
    const before = siteSetbackReport([lot(), pool()]).edges ?? []
    const after = siteSetbackReport([moved, pool()]).edges ?? []
    const leftBefore = before.find(e => e.edge === 'left')?.distanceIn
    const leftAfter = after.find(e => e.edge === 'left')?.distanceIn
    expect(leftBefore).toBe(20 * 12)
    expect(leftAfter).toBe(10 * 12)
  })
})

describe('a structure that was actually placed', () => {
  it('is measured edge to edge, and named', () => {
    const shapes = [pool(), house()]
    // House spans y -24→0 ft; the pool starts at y = 20 ft. Twenty feet clear.
    expect(distanceToHouse(shapes[0]!, shapes)).toBe("20' — House")
  })

  it('uses the name the builder gave it', () => {
    const garage = house()
    garage.name = 'Detached garage'
    expect(distanceToHouse(pool(), [pool(), garage])).toContain('Detached garage')
  })

  it('reports the nearest of several', () => {
    const far = house(10 * 12, -60 * 12)
    const near = { ...house(10 * 12, 5 * 12, 40 * 12, 10 * 12), id: 'house-2' }
    const report = siteSetbackReport([pool(), far, near])
    expect(report.structures).toHaveLength(2)
    // Near structure ends at y = 15 ft, pool starts at 20 ft.
    expect(report.toStructureIn).toBe(5 * 12)
  })

  it('ignores a hidden structure, the same as every other measurement', () => {
    const hidden = { ...house(), hidden: true }
    expect(findStructures([hidden])).toEqual([])
    expect(distanceToHouse(pool(), [pool(), hidden])).toBe('No structure placed')
  })
})

describe('the lot offered when there is nothing to go on', () => {
  it('contains what has already been drawn', () => {
    const suggestion = suggestedLot([pool()])
    expect(suggestion.x).toBeLessThan(20 * 12)
    expect(suggestion.y).toBeLessThan(20 * 12)
    expect(suggestion.x + suggestion.width).toBeGreaterThan(45 * 12)
    expect(suggestion.y + suggestion.height).toBeGreaterThan(32 * 12)
  })

  it('ignores an existing property line, so re-placing does not grow the lot', () => {
    const withLot = suggestedLot([pool(), lot()])
    const withoutLot = suggestedLot([pool()])
    expect(withLot).toEqual(withoutLot)
  })
})

describe('the lot survives being saved and reopened', () => {
  it('round-trips through Drawing.rootJson with its zoning limits intact', () => {
    // No migration and no new column: the property line is a shape, so it takes
    // the same path through `rootJson` that every other object already takes.
    const shapes = [lot({ frontFt: 25, sideFt: 5, rearFt: 7.5, easements: '10 ft drainage, rear' }), house(), pool()]
    const stored = JSON.parse(
      JSON.stringify(serializeDrawingPayload({ shapes, survey: null })),
    ) as unknown

    const reopened = parseDrawingPayload(stored)
    const found = findPropertyLine(reopened.shapes)
    expect(found?.limits).toEqual({
      frontFt: 25,
      sideFt: 5,
      rearFt: 7.5,
      easements: '10 ft drainage, rear',
    })
    expect(findStructures(reopened.shapes).map(s => s.label)).toEqual(['House'])
    // And the measurement is the same on the way back out.
    expect(distanceToHouse(reopened.shapes[2]!, reopened.shapes)).toBe("20' — House")
  })
})
