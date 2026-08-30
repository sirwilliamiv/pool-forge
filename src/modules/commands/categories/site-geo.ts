import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import {
  parseDrawingPayload,
  serializeDrawingPayload,
} from '@/modules/editor/drawing-payload'
import { snapToGrid } from '@/modules/editor/interactions/drag'
import { STRUCTURE_STENCIL } from '@/modules/editor/site/model'
import { ShapeKind, type Shape, type StencilShape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'
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
import {
  DEFAULT_SATELLITE,
  SITE_GEO_COMMANDS,
  satelliteImportPayloadSchema,
  surveyOpacityPayloadSchema,
  type SurveyOpacityPayload,
} from '@/modules/site/geo/types'

// Address to editor: the geographic commands.
//
// `site.address.set` pins the project to a point on Earth; the two imports
// turn that point into a scaled backdrop and a house. The backdrop is client
// state (survey store), so that command runs on the client exactly like
// `import.intent.apply`'s echo pattern; the building import writes to
// `Drawing.rootJson.shapes` in one transaction, replacing only its own
// previous import (tracked in `survey.importedBuildingShapeId`) and never any
// other shape. Property lines are hand-drawn via the property-line stencil;
// there is no parcel data provider.
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
 * Puts the imported building onto the project's drawing in a single
 * transaction. Other shapes are appended to, never replaced; the imported
 * building is the one exception, because a second import is a refresh of the
 * same house, not a second house. The previously imported shape (recorded in
 * `rootJson.survey.importedBuildingShapeId`) is removed in the same
 * transaction that appends the new one, and the new id is written back so the
 * next import can do the same.
 */
async function replaceImportedBuilding(args: {
  projectId: string
  drawingId: string | undefined
  makeShape: (existing: Shape[]) => StencilShape
}): Promise<{ ok: true; shapeId: string } | { ok: false; error: string }> {
  const { db } = await import('@/lib/db')

  return db.$transaction(async tx => {
    // Resolved the same way `import.intent.apply` does: a project has one
    // drawing, keyed by projectId. An explicit drawingId is accepted but must
    // be that drawing; anything else is a caller pointing at the wrong project.
    const drawing = await tx.drawing.findUnique({
      where: { projectId: args.projectId },
      select: { id: true, rootJson: true },
    })
    if (args.drawingId && drawing && drawing.id !== args.drawingId) {
      return { ok: false as const, error: 'That drawing does not belong to this project' }
    }
    if (args.drawingId && !drawing) {
      return { ok: false as const, error: 'Drawing not found' }
    }

    const payload = parseDrawingPayload(drawing?.rootJson ?? { shapes: [], survey: null })
    const priorBuildingId = payload.survey?.importedBuildingShapeId
    const kept =
      priorBuildingId === undefined
        ? payload.shapes
        : payload.shapes.filter(shape => shape.id !== priorBuildingId)

    const shape = args.makeShape(kept)

    // The id is recorded on the survey. A drawing with no underlay yet still
    // needs it remembered, so a minimal survey carrying only the id is
    // written; `parseSurvey` keeps it and the renderer ignores it (no image,
    // no geo, nothing to show).
    const survey: SurveyConfig = payload.survey
      ? { ...payload.survey, importedBuildingShapeId: shape.id }
      : ({ sourceImageId: '', importedBuildingShapeId: shape.id } as SurveyConfig)

    const merged = { ...payload, shapes: [...kept, shape], survey }

    await tx.drawing.upsert({
      where: { projectId: args.projectId },
      create: {
        projectId: args.projectId,
        scale: 1,
        rootJson: serializeDrawingPayload(merged) as unknown as object,
      },
      update: { rootJson: serializeDrawingPayload(merged) as unknown as object },
    })

    return { ok: true as const, shapeId: shape.id }
  })
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
})

type AddressSetOutput = z.infer<typeof addressSetOutput>

register({
  id: SITE_GEO_COMMANDS.addressSet,
  label: 'Set the site address',
  description:
    'Pin the project to its street address. Stores the geocoded location that the satellite backdrop and building imports both work from.',
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

    // Only the location fields: parcel number and jurisdiction are permit
    // fields the builder enters by hand, and this command never touches them.
    const data = {
      siteAddress: resolved.formattedAddress,
      sitePlaceId: input.placeId ?? null,
      latitude: resolved.lat,
      longitude: resolved.lng,
    }

    const { db } = await import('@/lib/db')
    // One transaction: the project's new location, and the drawing catching up
    // with it. A drawing whose survey has `geo` is showing the old address's
    // satellite backdrop, so the geo is repointed at the new lat/lng with its
    // dimensions recomputed (ground resolution varies with latitude; zoom and
    // map pixels are kept), and the imported building shape is deleted: a
    // house from the old address is meaningless at the new one. No other
    // shape is touched, and a drawing without `geo` is left entirely alone.
    await db.$transaction(async tx => {
      // updateMany keeps the org filter on the write, not just the read.
      await tx.project.updateMany({ where: { id: project.id, orgId: ctx.orgId }, data })

      const drawing = await tx.drawing.findUnique({
        where: { projectId: project.id },
        select: { rootJson: true },
      })
      if (!drawing) return
      const payload = parseDrawingPayload(drawing.rootJson)
      const survey = payload.survey
      if (!survey?.geo) return

      const geo = { ...survey.geo, lat: resolved.lat, lng: resolved.lng }
      const { widthInches, heightInches } = imageSizeInches(
        resolved.lat,
        geo.zoom,
        geo.mapWidthPx,
        geo.mapHeightPx,
      )

      const priorBuildingId = survey.importedBuildingShapeId
      const shapes =
        priorBuildingId === undefined
          ? payload.shapes
          : payload.shapes.filter(shape => shape.id !== priorBuildingId)

      const nextSurvey: SurveyConfig = { ...survey, geo, widthInches, heightInches }
      delete nextSurvey.importedBuildingShapeId

      await tx.drawing.update({
        where: { projectId: project.id },
        data: {
          rootJson: serializeDrawingPayload({
            ...payload,
            shapes,
            survey: nextSurvey,
          }) as unknown as object,
        },
      })
    })

    return {
      ok: true,
      data: {
        projectId: project.id,
        lat: resolved.lat,
        lng: resolved.lng,
        formattedAddress: resolved.formattedAddress,
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
    const appended = await replaceImportedBuilding({
      projectId: project.id,
      drawingId: input.drawingId,
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

/* -------------------------------------------------- site.survey.opacity */

register({
  id: SITE_GEO_COMMANDS.surveyOpacity,
  runsOn: 'client',
  label: 'Set the backdrop opacity',
  description:
    'Fade the satellite backdrop under the drawing. 1 is the full photo, lower values let the paper and grid read through it.',
  category: 'site',
  inputSchema: surveyOpacityPayloadSchema,
  outputSchema: surveyOpacityPayloadSchema,
  voiceExamples: [
    'Fade the satellite photo.',
    'Make the backdrop lighter.',
    'Set the site photo opacity to fifty percent.',
  ],
  // Pure client concern: the server half only validates and echoes, and the
  // handler in ClientCommandHandlers.tsx writes the survey store, which the
  // editor autosaves like any other survey edit.
  execute: async (input, ctx): Promise<CommandResult<SurveyOpacityPayload>> => {
    const unauthenticated = notAuthenticated<SurveyOpacityPayload>(ctx)
    if (unauthenticated) return unauthenticated
    return { ok: true, data: surveyOpacityPayloadSchema.parse(input) }
  },
})
