import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import {
  parseDrawingPayload,
  serializeDrawingPayload,
} from '@/modules/editor/drawing-payload'
import { snapToGrid } from '@/modules/editor/interactions/drag'
import {
  PROPERTY_LINE_STENCIL,
  STRUCTURE_STENCIL,
} from '@/modules/editor/site/model'
import { ShapeKind, type Shape, type StencilShape } from '@/modules/editor/state/shapes'
import {
  buildingInsights,
  mapsEnabled,
  placeLocation,
} from '@/modules/site/geo/google'
import {
  imageSizeInches,
  inchesPerPixel,
  projectToInches,
  type LatLng,
  type PointInches,
} from '@/modules/site/geo/mercator'
import { parcelAtPoint, regridEnabled } from '@/modules/site/geo/regrid'
import {
  DEFAULT_SATELLITE,
  SITE_GEO_COMMANDS,
  satelliteImportPayloadSchema,
} from '@/modules/site/geo/types'

// Address to editor: the geographic commands.
//
// `site.address.set` pins the project to a point on Earth; the three imports
// turn that point into a scaled backdrop, a lot boundary, and a house. The
// backdrop is client state (survey store), so that command runs on the client
// exactly like `import.intent.apply`'s echo pattern; the two shape imports
// append to `Drawing.rootJson.shapes` in one transaction, never replacing.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit
// tests that import every category to assert the catalog.

const ANONYMOUS = 'anonymous'

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

interface LocatedProject {
  id: string
  latitude: number | null
  longitude: number | null
  parcelId: string | null
  jurisdiction: string | null
}

/** Loads an org-scoped project with its site location, or an error result. */
async function loadProject(
  projectId: string,
  ctx: CommandContext,
): Promise<{ ok: true; project: LocatedProject } | { ok: false; error: string }> {
  const { db } = await import('@/lib/db')
  const project = await db.project.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      parcelId: true,
      jurisdiction: true,
    },
  })
  if (!project) return { ok: false, error: 'Project not found' }
  return { ok: true, project }
}

function requireLocation(
  project: LocatedProject,
): { ok: true; origin: LatLng } | { ok: false; error: string } {
  if (project.latitude === null || project.longitude === null) {
    return { ok: false, error: 'This project has no site location yet. Set the address first.' }
  }
  return { ok: true, origin: { lat: project.latitude, lng: project.longitude } }
}

function newShapeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`
}

function boundsOf(points: PointInches[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.xInches < minX) minX = point.xInches
    if (point.yInches < minY) minY = point.yInches
    if (point.xInches > maxX) maxX = point.xInches
    if (point.yInches > maxY) maxY = point.yInches
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function nextZIndex(shapes: Shape[]): number {
  let max = -1
  for (const shape of shapes) {
    if (shape.zIndex > max) max = shape.zIndex
  }
  return max + 1
}

/**
 * Appends one shape to the project's drawing in a single transaction,
 * optionally filling parcel fields on the project where they are still null.
 * Appended, never replacing: an import adds to what is drawn.
 */
async function appendShape(args: {
  projectId: string
  drawingId: string | undefined
  ctx: CommandContext
  makeShape: (existing: Shape[]) => StencilShape
  parcelFill?: { parcelId: string | null; jurisdiction: string | null }
  current?: { parcelId: string | null; jurisdiction: string | null }
}): Promise<{ ok: true; shapeId: string } | { ok: false; error: string }> {
  const { db } = await import('@/lib/db')

  // Resolved the same way `import.intent.apply` does: a project has one
  // drawing, keyed by projectId. An explicit drawingId is accepted but must be
  // that drawing; anything else is a caller pointing at the wrong project.
  const drawing = await db.drawing.findUnique({
    where: { projectId: args.projectId },
    select: { id: true, rootJson: true },
  })
  if (args.drawingId && drawing && drawing.id !== args.drawingId) {
    return { ok: false, error: 'That drawing does not belong to this project' }
  }
  if (args.drawingId && !drawing) {
    return { ok: false, error: 'Drawing not found' }
  }

  const payload = parseDrawingPayload(drawing?.rootJson ?? { shapes: [], survey: null })
  const shape = args.makeShape(payload.shapes)
  const merged = { ...payload, shapes: [...payload.shapes, shape] }

  // Only fields that are currently null are filled: parcel data must never
  // overwrite what a builder entered by hand for the permit set.
  const projectData: { parcelId?: string; jurisdiction?: string } = {}
  if (args.parcelFill && args.current) {
    if (args.current.parcelId === null && args.parcelFill.parcelId !== null) {
      projectData.parcelId = args.parcelFill.parcelId
    }
    if (args.current.jurisdiction === null && args.parcelFill.jurisdiction !== null) {
      projectData.jurisdiction = args.parcelFill.jurisdiction
    }
  }

  const writes = [
    db.drawing.upsert({
      where: { projectId: args.projectId },
      create: {
        projectId: args.projectId,
        scale: 1,
        rootJson: serializeDrawingPayload(merged) as unknown as object,
      },
      update: { rootJson: serializeDrawingPayload(merged) as unknown as object },
    }),
    ...(Object.keys(projectData).length > 0
      ? [db.project.update({ where: { id: args.projectId }, data: projectData })]
      : []),
  ]
  await db.$transaction(writes)

  return { ok: true, shapeId: shape.id }
}

/* ------------------------------------------------------ site.address.set */

const addressSetInput = z
  .object({
    projectId: z.string().min(1),
    placeId: z.string().min(1).optional().describe('A Google place id from address autocomplete.'),
    address: z.string().min(1).max(300).optional().describe('The address as typed, when no place id is available.'),
    lat: z.number().min(-85).max(85).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine(
    value =>
      value.placeId !== undefined ||
      (value.address !== undefined && value.lat !== undefined && value.lng !== undefined),
    { message: 'Provide a placeId, or an address with lat and lng.' },
  )

const addressSetOutput = z.object({
  projectId: z.string(),
  lat: z.number(),
  lng: z.number(),
  formattedAddress: z.string(),
  parcelId: z.string().nullable(),
  jurisdiction: z.string().nullable(),
})

type AddressSetOutput = z.infer<typeof addressSetOutput>

register({
  id: SITE_GEO_COMMANDS.addressSet,
  label: 'Set the site address',
  description:
    'Pin the project to its street address. Stores the geocoded location that the satellite backdrop, parcel, and building imports all work from, and autofills the parcel number and jurisdiction when parcel data is configured and those fields are still empty.',
  category: 'site',
  inputSchema: addressSetInput,
  outputSchema: addressSetOutput,
  voiceExamples: [
    'The site is 4128 Maple Street in Windermere.',
    'Set the project address.',
    'This pool is going in at the Hendersons’ place on Lakeshore Drive.',
  ],
  execute: async (input, ctx): Promise<CommandResult<AddressSetOutput>> => {
    const unauthenticated = notAuthenticated<AddressSetOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadProject(input.projectId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }
    const project = loaded.project

    let resolved: { lat: number; lng: number; formattedAddress: string }
    if (input.placeId !== undefined) {
      const place = await placeLocation(input.placeId)
      if (!place) {
        return { ok: false, error: 'That address could not be resolved. Try picking it again.' }
      }
      resolved = place
    } else {
      // The refine above guarantees these three are present together.
      resolved = {
        lat: input.lat as number,
        lng: input.lng as number,
        formattedAddress: input.address as string,
      }
    }

    // Parcel data is best-effort enrichment: a Regrid outage must not stop the
    // address from being set.
    const parcel = regridEnabled() ? await parcelAtPoint(resolved.lat, resolved.lng) : null

    const data: {
      siteAddress: string
      sitePlaceId: string | null
      latitude: number
      longitude: number
      parcelId?: string
      jurisdiction?: string
    } = {
      siteAddress: resolved.formattedAddress,
      sitePlaceId: input.placeId ?? null,
      latitude: resolved.lat,
      longitude: resolved.lng,
    }
    // Only where currently null: hand-entered permit fields are never overwritten.
    if (parcel?.parcelId && project.parcelId === null) data.parcelId = parcel.parcelId
    if (parcel?.jurisdiction && project.jurisdiction === null) {
      data.jurisdiction = parcel.jurisdiction
    }

    const { db } = await import('@/lib/db')
    // updateMany keeps the org filter on the write, not just the read.
    await db.project.updateMany({ where: { id: project.id, orgId: ctx.orgId }, data })

    return {
      ok: true,
      data: {
        projectId: project.id,
        lat: resolved.lat,
        lng: resolved.lng,
        formattedAddress: resolved.formattedAddress,
        parcelId: data.parcelId ?? project.parcelId,
        jurisdiction: data.jurisdiction ?? project.jurisdiction,
      },
    }
  },
})

/* ------------------------------------------------- site.import.satellite */

type SatellitePayload = z.infer<typeof satelliteImportPayloadSchema>

register({
  id: SITE_GEO_COMMANDS.importSatellite,
  runsOn: 'client',
  label: 'Import the satellite backdrop',
  description:
    'Drop a satellite photo of the property under the drawing at true scale, snapped to the grid. The image is reference, not geometry: tracing over it snaps as always. Requires the site address to be set first.',
  category: 'site',
  inputSchema: z.object({
    projectId: z.string().min(1),
    zoom: z.number().int().min(15).max(21).optional().describe('Static Maps zoom; defaults to 20, roughly one suburban lot.'),
  }),
  outputSchema: satelliteImportPayloadSchema,
  voiceExamples: [
    'Import the site.',
    'Put the satellite photo under the drawing.',
    'Show me the property from above.',
  ],
  // The server half validates and computes; the client handler (registered in
  // ClientCommandHandlers.tsx) writes the survey store with this payload.
  execute: async (input, ctx): Promise<CommandResult<SatellitePayload>> => {
    const unauthenticated = notAuthenticated<SatellitePayload>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadProject(input.projectId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }
    const location = requireLocation(loaded.project)
    if (!location.ok) return { ok: false, error: location.error }

    const zoom = input.zoom ?? DEFAULT_SATELLITE.zoom
    const { mapWidthPx, mapHeightPx } = DEFAULT_SATELLITE
    const { lat, lng } = location.origin

    const { widthInches, heightInches } = imageSizeInches(lat, zoom, mapWidthPx, mapHeightPx)
    const payload: SatellitePayload = satelliteImportPayloadSchema.parse({
      geo: { lat, lng, zoom, mapWidthPx, mapHeightPx },
      widthInches,
      heightInches,
      // Centred on the site origin, then snapped to the 6-inch drag grid so
      // the backdrop lands where traced shapes will snap anyway.
      xInches: snapToGrid(-widthInches / 2),
      yInches: snapToGrid(-heightInches / 2),
      inchesPerPixel: inchesPerPixel(lat, zoom),
    })

    return { ok: true, data: payload }
  },
})

/* ---------------------------------------------------- site.import.parcel */

const importParcelOutput = z.object({
  projectId: z.string(),
  shapeId: z.string(),
  pointCount: z.number().int(),
  parcelId: z.string().nullable(),
  jurisdiction: z.string().nullable(),
})

type ImportParcelOutput = z.infer<typeof importParcelOutput>

register({
  id: SITE_GEO_COMMANDS.importParcel,
  label: 'Import the parcel boundary',
  description:
    'Draw the lot boundary from county parcel data as a property line on the drawing, and fill in the parcel number and jurisdiction where they are still empty. Assessor lines are tax-map approximations, drawn to be adjusted, not surveyed. Requires parcel data to be configured and the site address to be set.',
  category: 'site',
  inputSchema: z.object({
    projectId: z.string().min(1),
    drawingId: z.string().min(1).optional(),
  }),
  outputSchema: importParcelOutput,
  voiceExamples: [
    'Import the property line from the county.',
    'Draw the parcel boundary.',
    'Bring in the lot lines.',
  ],
  execute: async (input, ctx): Promise<CommandResult<ImportParcelOutput>> => {
    const unauthenticated = notAuthenticated<ImportParcelOutput>(ctx)
    if (unauthenticated) return unauthenticated

    if (!regridEnabled()) {
      return { ok: false, error: 'Parcel data is not configured for this deployment.' }
    }

    const loaded = await loadProject(input.projectId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }
    const project = loaded.project
    const location = requireLocation(project)
    if (!location.ok) return { ok: false, error: location.error }

    const parcel = await parcelAtPoint(location.origin.lat, location.origin.lng)
    if (!parcel) {
      return { ok: false, error: 'No parcel was found at the site location.' }
    }

    // The parcel ring in editor inches, with the site origin at (0, 0): the
    // same origin the satellite backdrop centres on, so they line up.
    const points = parcel.polygon.map(vertex => projectToInches(location.origin, vertex))

    // The property line stencil is an axis-aligned rectangle (see
    // `site/model.ts`), so v1 lands the parcel's bounding box: the shape a
    // builder then drags and resizes like any hand-drawn lot. Its LotLimits
    // stay empty; setback numbers are entered, never invented.
    const bounds = boundsOf(points)
    const appended = await appendShape({
      projectId: project.id,
      drawingId: input.drawingId,
      ctx,
      makeShape: existing => ({
        id: newShapeId('site-parcel'),
        kind: ShapeKind.STENCIL,
        stencilId: PROPERTY_LINE_STENCIL,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        zIndex: nextZIndex(existing),
        locked: false,
        hidden: false,
        name: 'Property line',
      }),
      parcelFill: { parcelId: parcel.parcelId, jurisdiction: parcel.jurisdiction },
      current: { parcelId: project.parcelId, jurisdiction: project.jurisdiction },
    })
    if (!appended.ok) return { ok: false, error: appended.error }

    return {
      ok: true,
      data: {
        projectId: project.id,
        shapeId: appended.shapeId,
        pointCount: points.length,
        parcelId: parcel.parcelId,
        jurisdiction: parcel.jurisdiction,
      },
    }
  },
})

/* -------------------------------------------------- site.import.building */

const importBuildingOutput = z.object({
  projectId: z.string(),
  shapeId: z.string(),
  widthInches: z.number(),
  heightInches: z.number(),
})

type ImportBuildingOutput = z.infer<typeof importBuildingOutput>

register({
  id: SITE_GEO_COMMANDS.importBuilding,
  label: 'Import the building footprint',
  description:
    'Place the existing house on the drawing from aerial building data, so setbacks to the structure measure against something real. The footprint is the building’s bounding box in v1, placed to be adjusted. Requires the site address to be set.',
  category: 'site',
  inputSchema: z.object({
    projectId: z.string().min(1),
    drawingId: z.string().min(1).optional(),
  }),
  outputSchema: importBuildingOutput,
  voiceExamples: [
    'Import the house.',
    'Put the existing building on the drawing.',
    'Bring in the house footprint.',
  ],
  execute: async (input, ctx): Promise<CommandResult<ImportBuildingOutput>> => {
    const unauthenticated = notAuthenticated<ImportBuildingOutput>(ctx)
    if (unauthenticated) return unauthenticated

    if (!mapsEnabled()) {
      return { ok: false, error: 'Building data is not configured for this deployment.' }
    }

    const loaded = await loadProject(input.projectId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }
    const project = loaded.project
    const location = requireLocation(project)
    if (!location.ok) return { ok: false, error: location.error }

    const insights = await buildingInsights(location.origin.lat, location.origin.lng)
    if (!insights || insights.footprint.length < 3) {
      return { ok: false, error: 'No building was found at the site location.' }
    }

    const points = insights.footprint.map(vertex => projectToInches(location.origin, vertex))

    // The house lands as the existing `site.house-wall` stencil, sized to the
    // building's bounding box: the representation `site/model.ts` already
    // reads for "from house" setbacks, so nothing downstream changes.
    const bounds = boundsOf(points)
    const appended = await appendShape({
      projectId: project.id,
      drawingId: input.drawingId,
      ctx,
      makeShape: existing => ({
        id: newShapeId('site-building'),
        kind: ShapeKind.STENCIL,
        stencilId: STRUCTURE_STENCIL,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        zIndex: nextZIndex(existing),
        locked: false,
        hidden: false,
        name: 'House',
      }),
    })
    if (!appended.ok) return { ok: false, error: appended.error }

    return {
      ok: true,
      data: {
        projectId: project.id,
        shapeId: appended.shapeId,
        widthInches: bounds.width,
        heightInches: bounds.height,
      },
    }
  },
})
