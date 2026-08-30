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
import { PROPERTY_LINE_STENCIL, STRUCTURE_STENCIL } from '@/modules/editor/site/model'
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

beforeEach(() => {
  // Keys absent unless a test stubs one in: the degrade paths are the default.
  vi.stubEnv('MAPS_API_KEY', '')
  vi.stubEnv('REGRID_API_KEY', '')
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
      // Regrid is off in this test, so the permit fields stay untouched.
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
    it('site.import.parcel says parcel data is not configured', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      const result = await dispatchCommand(
        'site.import.parcel',
        { projectId },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('not configured')
    })

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

  describe('site.import.parcel with Regrid answering', () => {
    function stubRegrid(): void {
      vi.stubEnv('REGRID_API_KEY', 'regrid-token')
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              parcels: {
                features: [
                  {
                    geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [
                          [-81.5065, 28.4813],
                          [-81.5065, 28.4819],
                          [-81.5059, 28.4819],
                          [-81.5059, 28.4813],
                          [-81.5065, 28.4813],
                        ],
                      ],
                    },
                    properties: {
                      fields: { parcelnumb: '28-22-30-0000', county: 'Orange', ll_uuid: 'u-1' },
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      )
    }

    it('appends one property line, never replacing, and fills only null permit fields', async () => {
      const { orgId, userId, projectId } = await bootstrap()
      await locate(projectId)
      // The builder already looked up the jurisdiction by hand; it must survive.
      await db.project.update({ where: { id: projectId }, data: { jurisdiction: 'Hand-entered' } })

      const existingShape = {
        id: `existing-${orgId}`,
        kind: 'RECTANGLE_POOL',
        x: 0,
        y: 0,
        width: 120,
        height: 240,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
        depthShallow: 42,
        depthDeep: 72,
      }
      await db.drawing.create({
        data: { projectId, scale: 1, rootJson: { shapes: [existingShape], survey: null } },
      })

      stubRegrid()
      const result = await dispatchCommand(
        'site.import.parcel',
        { projectId },
        { userId, orgId },
        'UI',
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data).toMatchObject({
        projectId,
        parcelId: '28-22-30-0000',
        jurisdiction: 'Orange',
        pointCount: 4,
      })

      const drawing = await db.drawing.findUniqueOrThrow({ where: { projectId } })
      const payload = parseDrawingPayload(drawing.rootJson)
      // Appended: the pool the builder drew is still there, plus one lot line.
      expect(payload.shapes.length).toBe(2)
      expect(payload.shapes[0]?.id).toBe(existingShape.id)
      const lot = payload.shapes[1]
      expect(lot?.kind).toBe('STENCIL')
      expect((lot as { stencilId?: string }).stencilId).toBe(PROPERTY_LINE_STENCIL)
      expect(lot?.width).toBeGreaterThan(0)
      expect(lot?.height).toBeGreaterThan(0)
      expect(lot?.zIndex).toBe(1)

      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
      expect(project.parcelId).toBe('28-22-30-0000')
      // Null was filled; the hand-entered value was not overwritten.
      expect(project.jurisdiction).toBe('Hand-entered')
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
  })
})
