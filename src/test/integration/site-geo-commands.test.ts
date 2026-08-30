// Integration tests: hit the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention; the geo providers' HTTP is, where a test needs
// them at all.
//
// `dispatchCommand` writes the audit row centrally (see
// `src/modules/commands/dispatch.ts`), so a command run through it here lands
// a `CommandAuditLog` row the same way a real 'UI' click would.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { parseDrawingPayload } from '@/modules/editor/drawing-payload'
import { STRUCTURE_STENCIL } from '@/modules/editor/site/model'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { imageSizeInches } from '@/modules/site/geo/mercator'
import { satelliteImportPayloadSchema } from '@/modules/site/geo/types'
import { bootstrapOrgWithProject, reachableDb } from '@/test/integration/bootstrap'

const reachable = await reachableDb()
if (!reachable) {
  console.warn('site-geo integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const createdOrgIds: string[] = []

async function bootstrap() {
  const bootstrapped = await bootstrapOrgWithProject()
  createdOrgIds.push(bootstrapped.orgId)
  return bootstrapped
}

async function locate(projectId: string, lat = 28.4816, lng = -81.5062): Promise<void> {
  await db.project.update({ where: { id: projectId }, data: { latitude: lat, longitude: lng } })
}

/** A hand-drawn stencil shape that every import and address change must leave alone. */
function handDrawnShape(id: string): Shape {
  return {
    id,
    kind: ShapeKind.STENCIL,
    stencilId: 'symbol.tree',
    x: 100,
    y: 100,
    width: 48,
    height: 48,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
    name: 'Tree',
  }
}

/** The Solar API answering with a plausible bounding box. */
function stubSolarAnswer(): void {
  vi.stubEnv('MAPS_API_KEY', 'maps-key')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          boundingBox: {
            sw: { latitude: 28.4814, longitude: -81.5064 },
            ne: { latitude: 28.4818, longitude: -81.506 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  )
}

beforeEach(() => {
  // Key absent unless a test stubs it in: the degrade paths are the default.
  vi.stubEnv('MAPS_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(async () => {
  if (!reachable || createdOrgIds.length === 0) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
})

describe.skipIf(!reachable)('site geo commands', () => {
  describe('org scoping', () => {
    it('refuses every command against another org\'s project', async () => {
      const a = await bootstrap()
      const b = await bootstrap()
      await locate(a.projectId)
      const foreignCtx = { userId: b.userId, orgId: b.orgId }

      for (const [id, input] of [
        ['site.address.set', { projectId: a.projectId, address: 'X', lat: 1, lng: 1 }],
        ['site.import.satellite', { projectId: a.projectId }],
      ] as const) {
        const result = await dispatchCommand(id, input, foreignCtx, 'API')
        expect(result.ok, id).toBe(false)
        if (!result.ok) expect(result.error).toContain('not found')
      }
    })

    it('refuses an unauthenticated context', async () => {
      const { projectId } = await bootstrap()
      const result = await dispatchCommand(
        'site.import.satellite',
        { projectId },
        { userId: 'anonymous', orgId: 'anonymous' },
        'API',
      )
      expect(result.ok).toBe(false)
    })
  })

  describe('site.address.set', () => {
    it('writes the address and coordinates onto the project', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      const result = await dispatchCommand(
        'site.address.set',
        { projectId, address: '4128 Maple St, Windermere, FL', lat: 28.4816, lng: -81.5062 },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data).toMatchObject({
        projectId,
        lat: 28.4816,
        lng: -81.5062,
        formattedAddress: '4128 Maple St, Windermere, FL',
      })

      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
      expect(project.siteAddress).toBe('4128 Maple St, Windermere, FL')
      expect(project.sitePlaceId).toBeNull()
      expect(project.latitude).toBe(28.4816)
      expect(project.longitude).toBe(-81.5062)
      // Permit fields are hand-entered; setting the address never touches them.
      expect(project.parcelId).toBeNull()
      expect(project.jurisdiction).toBeNull()

      const audit = await db.commandAuditLog.findFirst({
        where: { orgId, commandId: 'site.address.set' },
      })
      expect(audit?.success).toBe(true)
    })

    it('refuses a placeId when maps are not configured, rather than inventing a location', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      const result = await dispatchCommand(
        'site.address.set',
        { projectId, placeId: 'place-1' },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(false)
    })
  })

  describe('site.import.satellite', () => {
    it('refuses a project with no location', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      const result = await dispatchCommand(
        'site.import.satellite',
        { projectId },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('address')
    })

    it('echoes a valid payload with grid-snapped placement', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)

      const result = await dispatchCommand(
        'site.import.satellite',
        { projectId, zoom: 20 },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const payload = satelliteImportPayloadSchema.parse(result.data)
      expect(payload.geo).toEqual({
        lat: 28.4816,
        lng: -81.5062,
        zoom: 20,
        mapWidthPx: 640,
        mapHeightPx: 640,
      })
      // Snapped to the 6-inch drag grid, and roughly centred on the origin.
      // Math.abs, because a negative multiple of 6 gives -0 under %.
      expect(Math.abs(payload.xInches % 6)).toBe(0)
      expect(Math.abs(payload.yInches % 6)).toBe(0)
      expect(Math.abs(payload.xInches + payload.widthInches / 2)).toBeLessThanOrEqual(3)
      expect(Math.abs(payload.yInches + payload.heightInches / 2)).toBeLessThanOrEqual(3)
      expect(payload.inchesPerPixel).toBeGreaterThan(0)
    })
  })

  describe('degrading without keys', () => {
    it('site.import.building says building data is not configured', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      const result = await dispatchCommand(
        'site.import.building',
        { projectId },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('not configured')
    })
  })

  describe('site.import.building with the Solar API answering', () => {
    it('appends a house-wall stencil sized from the bounding box', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      vi.stubEnv('MAPS_API_KEY', 'maps-key')
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              boundingBox: {
                sw: { latitude: 28.4814, longitude: -81.5064 },
                ne: { latitude: 28.4818, longitude: -81.506 },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      )

      const result = await dispatchCommand(
        'site.import.building',
        { projectId },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const drawing = await db.drawing.findUniqueOrThrow({ where: { projectId } })
      const payload = parseDrawingPayload(drawing.rootJson)
      expect(payload.shapes.length).toBe(1)
      const house = payload.shapes[0]
      expect((house as { stencilId?: string }).stencilId).toBe(STRUCTURE_STENCIL)
      expect(house?.name).toBe('House')
      expect(house?.width).toBeGreaterThan(0)
      expect(house?.height).toBeGreaterThan(0)
    })

    it('importing twice yields exactly one imported building, tracked by id', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      stubSolarAnswer()

      // A hand-drawn shape already on the drawing, which both imports must keep.
      await db.drawing.create({
        data: {
          projectId,
          scale: 1,
          rootJson: { shapes: [handDrawnShape('hand-tree-1')], survey: null } as unknown as object,
        },
      })

      const ctx = { userId, orgId }
      const first = await dispatchCommand('site.import.building', { projectId }, ctx, 'UI')
      const second = await dispatchCommand('site.import.building', { projectId }, ctx, 'UI')
      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) return
      const firstId = (first.data as { shapeId: string }).shapeId
      const secondId = (second.data as { shapeId: string }).shapeId
      expect(secondId).not.toBe(firstId)

      const drawing = await db.drawing.findUniqueOrThrow({ where: { projectId } })
      const payload = parseDrawingPayload(drawing.rootJson)

      // One house, not two: the second import replaced the first's shape.
      const houses = payload.shapes.filter(
        shape => (shape as { stencilId?: string }).stencilId === STRUCTURE_STENCIL,
      )
      expect(houses.length).toBe(1)
      expect(houses[0]?.id).toBe(secondId)
      expect(payload.shapes.some(shape => shape.id === firstId)).toBe(false)

      // The hand-drawn shape survived both imports.
      expect(payload.shapes.some(shape => shape.id === 'hand-tree-1')).toBe(true)

      // The tracked id points at the shape now on the drawing.
      expect(payload.survey?.importedBuildingShapeId).toBe(secondId)
    })
  })

  describe('site.address.set against an already imported site', () => {
    const GEO = { lat: 28.4816, lng: -81.5062, zoom: 20, mapWidthPx: 640, mapHeightPx: 640 }

    function importedSurvey(buildingShapeId: string): Record<string, unknown> {
      return {
        sourceImageId: '',
        x: -384,
        y: -384,
        widthInches: 700,
        heightInches: 700,
        opacity: 0.9,
        locked: true,
        calibrationPxDistance: 100,
        calibrationRealInches: 120,
        imageNaturalWidthPx: 1280,
        imageNaturalHeightPx: 1280,
        geo: { ...GEO },
        importedBuildingShapeId: buildingShapeId,
      }
    }

    function importedBuilding(id: string): Shape {
      return {
        id,
        kind: ShapeKind.STENCIL,
        stencilId: STRUCTURE_STENCIL,
        x: -200,
        y: -150,
        width: 480,
        height: 300,
        rotation: 0,
        zIndex: 1,
        locked: false,
        hidden: false,
        name: 'House',
      }
    }

    it('repoints the geo, recomputes dimensions, and deletes only the imported building', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      await db.drawing.create({
        data: {
          projectId,
          scale: 1,
          rootJson: {
            shapes: [importedBuilding('site-building-old'), handDrawnShape('hand-tree-2')],
            survey: importedSurvey('site-building-old'),
          } as unknown as object,
        },
      })

      const result = await dispatchCommand(
        'site.address.set',
        { projectId, address: '900 Bayshore Blvd, Tampa, FL', lat: 27.9506, lng: -82.4572 },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)

      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
      expect(project.latitude).toBe(27.9506)
      expect(project.longitude).toBe(-82.4572)

      const drawing = await db.drawing.findUniqueOrThrow({ where: { projectId } })
      const payload = parseDrawingPayload(drawing.rootJson)

      // The geo now points at the new address, zoom and map pixels kept.
      expect(payload.survey?.geo).toEqual({ ...GEO, lat: 27.9506, lng: -82.4572 })

      // Dimensions recomputed for the new latitude's ground resolution.
      const expected = imageSizeInches(27.9506, GEO.zoom, GEO.mapWidthPx, GEO.mapHeightPx)
      expect(payload.survey?.widthInches).toBeCloseTo(expected.widthInches)
      expect(payload.survey?.heightInches).toBeCloseTo(expected.heightInches)

      // The old address's building is gone and its tracking cleared; the
      // hand-drawn shape is untouched.
      expect(payload.shapes.map(shape => shape.id)).toEqual(['hand-tree-2'])
      expect(payload.survey?.importedBuildingShapeId).toBeUndefined()

      // Nothing else about the survey moved.
      expect(payload.survey?.x).toBe(-384)
      expect(payload.survey?.y).toBe(-384)
      expect(payload.survey?.opacity).toBe(0.9)
      expect(payload.survey?.locked).toBe(true)
    })

    it('leaves the drawing alone when there is no satellite geo', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      const before = {
        shapes: [handDrawnShape('hand-tree-3')],
        survey: null,
      } as unknown as object
      await db.drawing.create({ data: { projectId, scale: 1, rootJson: before } })

      const result = await dispatchCommand(
        'site.address.set',
        { projectId, address: '1 First St, Orlando, FL', lat: 28.54, lng: -81.38 },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)

      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
      expect(project.siteAddress).toBe('1 First St, Orlando, FL')

      const drawing = await db.drawing.findUniqueOrThrow({ where: { projectId } })
      expect(drawing.rootJson).toEqual(before)
    })
  })
})
