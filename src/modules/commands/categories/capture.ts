import { z } from 'zod'

import {
  CaptureRejection,
  encodeCaptureRejection,
  type Heightfield,
} from '@/modules/capture/contract'
import {
  coverageCaveat,
  coverageHeadline,
  coverageOver,
  fieldBounds,
  measuredCellCount,
} from '@/modules/capture/coverage'
import { decodeCapture } from '@/modules/capture/decode'
import { CAPTURE_REF_PATTERN, takeStagedCapture } from '@/modules/capture/staging'
import { packHeightfield, unpackHeightfield } from '@/modules/capture/storage'
import {
  existingSurfaceFrom,
  placeHeightfield,
  provenanceFrom,
} from '@/modules/capture/surface'
import { parseDrawingPayload, serializeDrawingPayload } from '@/modules/editor/drawing-payload'
import { emptyGrade, type Bounds } from '@/modules/editor/grade/model'
import { visibleBounds } from '@/modules/editor/placement'
import { isPolygonPool, isPool, type Shape } from '@/modules/editor/state/shapes'
import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'

// Walking the site with a phone.
//
// The builder walks the yard in lawnmower stripes and ARKit paints the ground.
// What arrives is a heightfield and a coverage mask, and the mask is the reason
// this exists: an interpolated surface and a measured one are the same mesh,
// the same contours and the same cut and fill, and only the mask knows which is
// which.
//
// Both commands run on the server. `capture.heightfield.ingest` is reached from
// `/api/capture/heightfield`, which stages the document and dispatches with a
// ref rather than putting a megabyte of heights into an audit row.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit
// tests that import every category to assert the catalogue.

const ANONYMOUS = 'anonymous'

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

/** Feet, because everything a builder says about a site is in feet. */
const feetCoordinate = z.number().finite().min(-100_000).max(100_000)

const coverageOutput = z.object({
  measuredPct: z.number(),
  areaSqft: z.number(),
  measuredAreaSqft: z.number(),
  gapAreaSqft: z.number(),
  largestGapSqft: z.number(),
  complete: z.boolean(),
  headline: z.string(),
  /** The sentence to print under the number. Null when nothing is a guess. */
  caveat: z.string().nullable(),
})

register({
  id: 'capture.heightfield.ingest',
  runsOn: 'server',
  label: 'Take in a walked site capture',
  description:
    'Take the heightfield from a phone that walked the site and make it the existing ground. The elevations come in as a grid with a coverage mask, and only the cells somebody actually walked become survey shots. The benchmark the builder tapped sets the datum.',
  category: 'capture',
  inputSchema: z.object({
    /**
     * The staged document, not the document.
     *
     * A 60,000 cell capture is about a megabyte of JSON and command inputs are
     * written verbatim into the audit log. The route stages it and passes this.
     */
    captureRef: z.string().regex(CAPTURE_REF_PATTERN, 'not a staged capture reference'),
    projectId: z.string().min(1).max(64),
    /** Where the benchmark tap lands on the drawing, in feet. */
    anchorXFt: feetCoordinate.optional(),
    anchorYFt: feetCoordinate.optional(),
    /** How many survey shots the capture may leave behind. */
    maxShots: z.number().int().min(4).max(200).optional(),
  }),
  outputSchema: z.object({
    captureId: z.string(),
    projectId: z.string(),
    cols: z.number(),
    rows: z.number(),
    cells: z.number(),
    measuredCells: z.number(),
    /** Shots written onto the existing surface, benchmark included. */
    shotCount: z.number(),
    /** Hand-set constraints a walk does not overrule. */
    keptFixed: z.number(),
    /** Typed shots the walk superseded. */
    replacedPoints: z.number(),
    /** Worst disagreement between the shots and the walked ground, in feet. */
    maxErrorFt: z.number(),
    datumFt: z.number(),
    coverage: coverageOutput,
  }),
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated(ctx)
    if (unauthenticated) return unauthenticated

    const staged = takeStagedCapture(input.captureRef, ctx.orgId)
    if (staged === null) {
      return {
        ok: false,
        error:
          'That site capture is no longer available to process. Nothing was changed. Send it again from the phone.',
      }
    }

    let field: Heightfield
    try {
      field = decodeCapture(staged)
    } catch (err) {
      if (err instanceof CaptureRejection) {
        // The code travels with the sentence so the route can pick a status.
        // The sentence is already a sentence; nothing raw reaches the user.
        return { ok: false, error: encodeCaptureRejection(err) }
      }
      // Anything else is ours, not theirs. The detail goes to the log.
      console.error('[capture.heightfield.ingest] unexpected failure decoding a capture', err)
      return {
        ok: false,
        error: 'That site capture could not be processed. Nothing was changed.',
      }
    }

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId: ctx.orgId },
      select: { id: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    const placed = placeHeightfield(field, {
      xIn: (input.anchorXFt ?? 0) * 12,
      yIn: (input.anchorYFt ?? 0) * 12,
    })

    const drawing = await db.drawing.findUnique({
      where: { projectId: project.id },
      select: { rootJson: true },
    })
    const payload = parseDrawingPayload(drawing?.rootJson ?? { shapes: [], survey: null })
    const previousExisting = payload.grade?.existing ?? null
    const previousFinished = payload.grade?.finished ?? emptyGrade()

    const surfaceOptions =
      input.maxShots === undefined ? {} : { maxShots: input.maxShots }
    const built = existingSurfaceFrom(placed, previousExisting, surfaceOptions)
    const report = coverageOver(placed, fieldBounds(placed))
    built.grade.capture = provenanceFrom(placed, report, built)

    const packed = packHeightfield(placed)
    const measuredCells = measuredCellCount(placed)

    const merged = {
      ...payload,
      grade: {
        existing: built.grade,
        // The finished surface is design intent and has nothing to do with what
        // the phone saw. Walking the yard must never move the design.
        finished: previousFinished,
      },
    }

    await db.$transaction([
      db.drawing.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          scale: 1,
          rootJson: serializeDrawingPayload(merged) as unknown as object,
        },
        update: { rootJson: serializeDrawingPayload(merged) as unknown as object },
      }),
      // Keyed on the phone's own capture id, so an upload retried after a lost
      // connection updates one row rather than recording the yard twice.
      db.siteCapture.upsert({
        where: { orgId_captureId: { orgId: ctx.orgId, captureId: placed.captureId } },
        create: {
          orgId: ctx.orgId,
          projectId: project.id,
          captureId: placed.captureId,
          cols: placed.cols,
          rows: placed.rows,
          cellSizeIn: placed.cellSizeIn,
          originXIn: placed.originXIn,
          originYIn: placed.originYIn,
          benchmarkXIn: placed.benchmarkXIn,
          benchmarkYIn: placed.benchmarkYIn,
          datumFt: placed.datumFt,
          benchmarkLabel: placed.benchmarkLabel,
          elevationsFt: packed.elevationsFt,
          coverage: packed.coverage,
          measuredCells,
          shotCount: built.shotCount,
          maxErrorFt: built.maxErrorFt,
          capturedAt: new Date(placed.capturedAt),
          createdBy: ctx.userId === ANONYMOUS ? null : ctx.userId,
        },
        update: {
          projectId: project.id,
          cols: placed.cols,
          rows: placed.rows,
          cellSizeIn: placed.cellSizeIn,
          originXIn: placed.originXIn,
          originYIn: placed.originYIn,
          benchmarkXIn: placed.benchmarkXIn,
          benchmarkYIn: placed.benchmarkYIn,
          datumFt: placed.datumFt,
          benchmarkLabel: placed.benchmarkLabel,
          elevationsFt: packed.elevationsFt,
          coverage: packed.coverage,
          measuredCells,
          shotCount: built.shotCount,
          maxErrorFt: built.maxErrorFt,
          capturedAt: new Date(placed.capturedAt),
        },
      }),
    ])

    return {
      ok: true,
      data: {
        captureId: placed.captureId,
        projectId: project.id,
        cols: placed.cols,
        rows: placed.rows,
        cells: placed.cols * placed.rows,
        measuredCells,
        shotCount: built.shotCount,
        keptFixed: built.keptFixed,
        replacedPoints: built.replaced,
        maxErrorFt: Math.round(built.maxErrorFt * 1_000) / 1_000,
        datumFt: placed.datumFt,
        coverage: describe(report, 'the captured area'),
      },
    }
  },
})

const REGIONS = ['capture', 'site', 'pool'] as const

register({
  id: 'capture.coverage.describe',
  runsOn: 'server',
  label: 'How much of this ground was walked',
  description:
    'Report how much of an area was actually measured by the site capture and how much is being interpolated across ground nobody walked. Read-only. Ask about the pool footprint, everything drawn, or the whole captured area.',
  category: 'capture',
  inputSchema: z.object({
    projectId: z.string().min(1).max(64),
    region: z
      .enum(REGIONS)
      .optional()
      .describe(
        '"pool" is the pool footprint, "site" is everything drawn, "capture" is the whole area that was walked. Defaults to the pool when there is one.',
      ),
  }),
  outputSchema: z.object({
    captureId: z.string().nullable(),
    capturedAt: z.string().nullable(),
    region: z.string(),
    /** Null when there is no capture on this project at all. */
    coverage: coverageOutput.nullable(),
    /** What to say when there is nothing to report on. */
    note: z.string().nullable(),
  }),
  voiceExamples: [
    'How much of this yard did we actually walk?',
    'Is the pool area measured or guessed?',
    'Did the capture cover the whole site?',
  ],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId: ctx.orgId },
      select: { id: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    // The org filter here is redundant with the project lookup above, which is
    // already org-scoped, and no test can reach past it. It is kept anyway: the
    // day somebody adds a second way to name a capture, this query is already
    // right rather than already wrong.
    const row = await db.siteCapture.findFirst({
      where: { projectId: project.id, orgId: ctx.orgId },
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
    })
    if (!row) {
      return {
        ok: true,
        data: {
          captureId: null,
          capturedAt: null,
          region: input.region ?? 'capture',
          coverage: null,
          note: NO_CAPTURE,
        },
      }
    }

    const field = unpackHeightfield(row)

    const drawing = await db.drawing.findUnique({
      where: { projectId: project.id },
      select: { rootJson: true },
    })
    const shapes = parseDrawingPayload(drawing?.rootJson ?? { shapes: [], survey: null }).shapes

    const wanted = input.region ?? (poolBounds(shapes) ? 'pool' : 'capture')
    const region = regionBounds(wanted, shapes, field)
    if (!region) {
      return {
        ok: true,
        data: {
          captureId: field.captureId,
          capturedAt: field.capturedAt,
          region: wanted,
          coverage: null,
          note:
            wanted === 'pool'
              ? 'There is no pool drawn yet, so there is no footprint to check the capture against.'
              : 'There is nothing drawn yet, so there is no area to check the capture against.',
        },
      }
    }

    return {
      ok: true,
      data: {
        captureId: field.captureId,
        capturedAt: field.capturedAt,
        region: wanted,
        coverage: describe(coverageOver(field, region), REGION_WORDS[wanted]),
        note: null,
      },
    }
  },
})

const NO_CAPTURE =
  'Nobody has walked this site with a phone, so the existing ground is whatever was entered by hand.'

const REGION_WORDS: Record<(typeof REGIONS)[number], string> = {
  capture: 'the captured area',
  site: 'the site',
  pool: 'the pool footprint',
}

/** The report, plus the two sentences that go on screen with it. */
function describe(
  report: ReturnType<typeof coverageOver>,
  what: string,
): z.infer<typeof coverageOutput> {
  return {
    measuredPct: Math.round(report.fraction * 1_000) / 10,
    areaSqft: report.areaSqft,
    measuredAreaSqft: report.measuredAreaSqft,
    gapAreaSqft: report.gapAreaSqft,
    largestGapSqft: report.largestGapSqft,
    complete: report.complete,
    headline: coverageHeadline(report),
    caveat: coverageCaveat(report, what),
  }
}

function regionBounds(
  region: (typeof REGIONS)[number],
  shapes: Shape[],
  field: Heightfield,
): Bounds | null {
  if (region === 'capture') return fieldBounds(field)
  if (region === 'site') return visibleBounds(shapes)
  return poolBounds(shapes)
}

/** The footprint of every pool drawn, as one box. */
function poolBounds(shapes: Shape[]): Bounds | null {
  const pools = shapes.filter(shape => isPool(shape) || isPolygonPool(shape))
  return visibleBounds(pools)
}
