import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import {
  getVisionAnalysisPort,
  SOURCE_IMAGE_KINDS,
  type SourceImageKind,
  type VisionAnalysisRequest,
} from '@/modules/imports/analysis-port'
import { ingestImage } from '@/modules/imports/ingest'
import { logIngestFailure } from '@/modules/imports/ingest/errors'
import { encodeRejection } from '@/modules/imports/ingest/rejection'
import { takeStagedUpload, UPLOAD_REF_PATTERN } from '@/modules/imports/ingest/staging'
import {
  ALLOWED_MIME_TYPES,
  IngestRejection,
  MAX_IMAGES_PER_SESSION,
  type IngestInput,
  type IngestResult,
} from '@/modules/imports/ingest/types'
import { resolveVisionBlob } from '@/modules/imports/ingest/variants'
import {
  DesignIntentSchema,
  ScaleMethodSchema,
  emptyDesignIntent,
  fieldsRequiringReview,
  type DesignIntent,
} from '@/modules/imports/intent'
import {
  DesignIntentPatchSchema,
  applyIntentPatch,
  parseStoredIntent,
  touchedPaths,
} from '@/modules/imports/patch'

// Image ingestion commands. Every user-driven step of the pipeline dispatches
// through here, including the ones a route triggers on the user's behalf: the
// upload route stages bytes and then calls `import.image.upload`.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit
// tests that import every category to assert the catalog.

const ANONYMOUS = 'anonymous'

const sessionOutput = z.object({
  sessionId: z.string(),
  status: z.enum(['DRAFT', 'READY', 'APPLIED', 'DISCARDED']),
  intent: DesignIntentSchema,
})

type SessionOutput = z.infer<typeof sessionOutput>

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

/** Loads an org-scoped session and its intent, or an error result. */
async function loadSession(
  sessionId: string,
  ctx: CommandContext,
): Promise<
  | {
      ok: true
      id: string
      projectId: string | null
      intent: DesignIntent
      touchedFieldPaths: string[]
    }
  | { ok: false; error: string }
> {
  const { db } = await import('@/lib/db')
  const row = await db.importSession.findFirst({
    where: { id: sessionId, orgId: ctx.orgId },
    select: { id: true, projectId: true, designIntentJson: true, touchedFieldPaths: true },
  })
  if (!row) return { ok: false, error: 'Import session not found' }
  return {
    ok: true,
    id: row.id,
    projectId: row.projectId,
    intent: parseStoredIntent(row.designIntentJson) ?? emptyDesignIntent(),
    touchedFieldPaths: row.touchedFieldPaths,
  }
}

/**
 * Gate 2 from the design spec. A field whose confidence sits below
 * CONFIDENCE_REVIEW_REQUIRED may not be applied until a human has corrected it
 * through `import.intent.patch`. Returns the paths still blocking an apply.
 */
export function unreviewedFieldPaths(intent: DesignIntent, touched: string[]): string[] {
  const seen = new Set(touched)
  return fieldsRequiringReview(intent).filter(path => !seen.has(path))
}

register({
  id: 'import.session.create',
  label: 'Start image import',
  description:
    'Open an import session: the reviewable unit that spans every image in one ingestion and holds the extracted design intent.',
  category: 'import',
  inputSchema: z.object({
    projectId: z.string().min(1).optional(),
    sourceImageIds: z.array(z.string().min(1)).optional(),
  }),
  outputSchema: sessionOutput,
  voiceExamples: [
    'Start an import from a sketch.',
    'Import a site plan into this project.',
  ],
  execute: async (input, ctx): Promise<CommandResult<SessionOutput>> => {
    const unauthenticated = notAuthenticated<SessionOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: { id: input.projectId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!project) return { ok: false, error: 'Project not found' }
    }

    // Only source images belonging to this org may seed a session.
    const requested = input.sourceImageIds ?? []
    let sourceImageIds: string[] = []
    if (requested.length > 0) {
      const rows = await db.sourceImage.findMany({
        where: { id: { in: requested }, orgId: ctx.orgId },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      if (rows.length !== requested.length) {
        return { ok: false, error: 'One or more source images were not found' }
      }
      sourceImageIds = rows.map((r) => r.id)
    }

    const intent = emptyDesignIntent(sourceImageIds)
    const created = await db.importSession.create({
      data: {
        orgId: ctx.orgId,
        projectId: input.projectId ?? null,
        status: 'DRAFT',
        designIntentJson: intent as unknown as object,
        appliedCommandIds: [],
      },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: created.id, status: created.status, intent } }
  },
})

const ingestOutput = z.object({
  sessionId: z.string(),
  sourceImageId: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  deduped: z.boolean(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  storageKey: z.string(),
  visionKey: z.string(),
  thumbnailKey: z.string(),
  /** Every image now attached to the session, in attachment order. */
  sourceImageIds: z.array(z.string()),
})

type IngestOutput = z.infer<typeof ingestOutput>

register({
  id: 'import.image.upload',
  label: 'Upload source image',
  description:
    'Register uploaded bytes as a SourceImage: sha256 dedupe, magic-byte sniff, EXIF strip, downscale, thumbnail.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    // Bytes cannot travel inside a command input: the input is written verbatim
    // into CommandAuditLog and a 15MB upload would base64 to 20MB of JSON per
    // row. The route stages the buffer in process and passes a single-use ref,
    // so the command still owns the ingest and the audit row stays small.
    uploadRef: z.string().regex(UPLOAD_REF_PATTERN),
    projectId: z.string().min(1).optional(),
    origin: z.enum(['BUILDER', 'CUSTOMER_INTAKE']).optional(),
  }),
  outputSchema: ingestOutput,
  voiceExamples: ['Upload this sketch.', 'Add a site plan photo.'],
  execute: async (input, ctx): Promise<CommandResult<IngestOutput>> => {
    const unauthenticated = notAuthenticated<IngestOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const attached = loaded.intent.sourceImageIds
    if (attached.length >= MAX_IMAGES_PER_SESSION) {
      return {
        ok: false,
        error: encodeRejection(
          new IngestRejection(
            'TOO_MANY',
            `An import can hold at most ${MAX_IMAGES_PER_SESSION} images.`,
          ),
        ),
      }
    }

    // Single use: the ref is burned whether or not the ingest succeeds, so a
    // leaked ref cannot be replayed and a failed upload cannot pin a buffer.
    const staged = takeStagedUpload(input.uploadRef, ctx.orgId)
    if (!staged) {
      return { ok: false, error: 'That upload expired. Try again.' }
    }

    const ingestInput: IngestInput = {
      bytes: staged.bytes,
      declaredMimeType: staged.declaredMimeType,
      orgId: ctx.orgId,
      projectId: input.projectId ?? loaded.projectId,
      origin: input.origin ?? 'BUILDER',
      uploadedBy: ctx.userId === ANONYMOUS ? null : ctx.userId,
    }

    let result: IngestResult
    try {
      result = await ingestImage(ingestInput)
    } catch (err) {
      if (err instanceof IngestRejection) return { ok: false, error: encodeRejection(err) }
      const ref = logIngestFailure('import.image.upload', err)
      return { ok: false, error: `That upload could not be processed (ref ${ref}).` }
    }

    const sourceImageIds = attached.includes(result.sourceImageId)
      ? attached
      : [...attached, result.sourceImageId]

    const intent: DesignIntent = { ...loaded.intent, sourceImageIds }

    const { db } = await import('@/lib/db')
    await db.importSession.update({
      where: { id: loaded.id },
      data: { designIntentJson: intent as unknown as object },
      select: { id: true },
    })

    return {
      ok: true,
      data: {
        sessionId: loaded.id,
        sourceImageId: result.sourceImageId,
        sha256: result.sha256,
        deduped: result.deduped,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        mimeType: result.mimeType,
        storageKey: result.storageKey,
        visionKey: result.visionKey,
        thumbnailKey: result.thumbnailKey,
        sourceImageIds,
      },
    }
  },
})

const analyzeOutput = z.object({
  sourceImageId: z.string(),
  cached: z.boolean(),
  intent: DesignIntentSchema,
})

type AnalyzeOutput = z.infer<typeof analyzeOutput>

register({
  id: 'import.image.analyze',
  label: 'Analyze source image',
  description:
    'Run classify and extract over a source image, writing one ImageAnalysis row per stage. Idempotent and cached on (sourceImageId, stage, extractorVersion).',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sourceImageId: z.string().min(1),
    extractorVersion: z.string().min(1).optional(),
    force: z.boolean().optional(),
  }),
  outputSchema: analyzeOutput,
  voiceExamples: ['Analyze the sketch.', 'Read the dimensions off this plan.'],
  // The durable half lives here: org scoping, the (sourceImageId, stage,
  // extractorVersion) cache, the ImageAnalysis rows, and folding the result
  // back into the session intent. The model half is Track I2's, reached only
  // through the VisionAnalysisPort so neither track edits the other's files.
  execute: async (input, ctx): Promise<CommandResult<AnalyzeOutput>> => {
    const unauthenticated = notAuthenticated<AnalyzeOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const { db } = await import('@/lib/db')
    const image = await db.sourceImage.findFirst({
      where: { id: input.sourceImageId, orgId: ctx.orgId },
      select: { id: true, storageKey: true, kind: true, widthPx: true, heightPx: true },
    })
    if (!image) return { ok: false, error: 'Source image not found' }
    if (!loaded.intent.sourceImageIds.includes(image.id)) {
      return { ok: false, error: 'That image is not part of this import' }
    }

    const port = getVisionAnalysisPort()
    const extractorVersion = input.extractorVersion ?? port.extractorVersion

    if (!input.force) {
      const cached = await db.imageAnalysis.findFirst({
        where: { sourceImageId: image.id, extractorVersion, status: 'OK' },
        select: { id: true },
      })
      if (cached) {
        return {
          ok: true,
          data: { sourceImageId: image.id, cached: true, intent: loaded.intent },
        }
      }
    }

    let vision: { storageKey: string; mimeType: string }
    try {
      vision = await resolveVisionBlob(image.storageKey)
    } catch (err) {
      const ref = logIngestFailure('import.image.analyze vision blob', err)
      return { ok: false, error: `That image could not be prepared for analysis (ref ${ref}).` }
    }

    const request: VisionAnalysisRequest = {
      orgId: ctx.orgId,
      sourceImageId: image.id,
      visionKey: vision.storageKey,
      visionMimeType: vision.mimeType,
      widthPx: image.widthPx,
      heightPx: image.heightPx,
      kind: image.kind,
      intent: loaded.intent,
    }

    let analysis
    try {
      analysis = await port.analyze(request)
    } catch (err) {
      const ref = logIngestFailure('import.image.analyze', err)
      return { ok: false, error: `Analysis failed (ref ${ref}).` }
    }

    // The port is a boundary, so its output is validated like any other.
    const parsedIntent = DesignIntentSchema.safeParse(analysis.intent)
    const intent: DesignIntent = parsedIntent.success
      ? parsedIntent.data
      : {
          ...loaded.intent,
          warnings: [...loaded.intent.warnings, 'The extractor returned an unusable design.'],
        }
    if (!parsedIntent.success) {
      logIngestFailure('import.image.analyze intent validation', parsedIntent.error.issues)
    }

    for (const stage of analysis.stages) {
      await db.imageAnalysis.upsert({
        where: {
          sourceImageId_stage_extractorVersion: {
            sourceImageId: image.id,
            stage: stage.stage,
            extractorVersion,
          },
        },
        create: {
          sourceImageId: image.id,
          stage: stage.stage,
          extractorVersion,
          model: stage.model,
          promptHash: stage.promptHash,
          rawJson: (stage.raw ?? {}) as object,
          parsedJson: (stage.parsed ?? {}) as object,
          tokensIn: stage.tokensIn,
          tokensOut: stage.tokensOut,
          latencyMs: stage.latencyMs,
          status: stage.status,
          errorRef: stage.errorRef,
        },
        update: {
          model: stage.model,
          promptHash: stage.promptHash,
          rawJson: (stage.raw ?? {}) as object,
          parsedJson: (stage.parsed ?? {}) as object,
          tokensIn: stage.tokensIn,
          tokensOut: stage.tokensOut,
          latencyMs: stage.latencyMs,
          status: stage.status,
          errorRef: stage.errorRef,
        },
        select: { id: true },
      })
    }

    const kind: SourceImageKind = SOURCE_IMAGE_KINDS.includes(analysis.kind)
      ? analysis.kind
      : 'UNKNOWN'
    if (kind !== image.kind) {
      // updateMany keeps the org filter on the write, not just the read.
      await db.sourceImage.updateMany({
        where: { id: image.id, orgId: ctx.orgId },
        data: { kind },
      })
    }

    await db.importSession.update({
      where: { id: loaded.id },
      data: { designIntentJson: intent as unknown as object },
      select: { id: true },
    })

    return { ok: true, data: { sourceImageId: image.id, cached: false, intent } }
  },
})

register({
  id: 'import.calibrate.set',
  label: 'Set image scale',
  description:
    'Set the pixels-per-inch scale for an import session. The manual two-point fallback when no grid, labeled dimension, or scale bar was resolved.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    pixelsPerInch: z.number().positive(),
    method: ScaleMethodSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  outputSchema: sessionOutput,
  voiceExamples: [
    'Calibrate this drawing: one square is one foot.',
    'Set the scale from these two points.',
  ],
  execute: async (input, ctx): Promise<CommandResult<SessionOutput>> => {
    const unauthenticated = notAuthenticated<SessionOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const intent: DesignIntent = {
      ...loaded.intent,
      scale: {
        pixelsPerInch: input.pixelsPerInch,
        method: input.method ?? 'manual',
        confidence: input.confidence ?? 1,
      },
    }

    const { db } = await import('@/lib/db')
    const updated = await db.importSession.update({
      where: { id: loaded.id },
      data: { designIntentJson: intent as unknown as object },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: updated.id, status: updated.status, intent } }
  },
})

register({
  id: 'import.intent.patch',
  label: 'Edit extracted design',
  description:
    'Apply a human correction to the extracted design intent. Every edit is a command so the audit log records exactly what the model got wrong.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    patch: DesignIntentPatchSchema,
  }),
  outputSchema: sessionOutput.extend({
    touchedPaths: z.array(z.string()),
  }),
  voiceExamples: [
    'The pool is thirty-two feet, not thirty-four.',
    'Change the deck material to travertine.',
  ],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<SessionOutput & { touchedPaths: string[] }>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const intent = applyIntentPatch(loaded.intent, input.patch)
    const paths = touchedPaths(input.patch)
    const merged = [...new Set([...loaded.touchedFieldPaths, ...paths])].sort()

    const { db } = await import('@/lib/db')
    const updated = await db.importSession.update({
      where: { id: loaded.id },
      data: {
        designIntentJson: intent as unknown as object,
        touchedFieldPaths: merged,
      },
      select: { id: true, status: true },
    })

    return {
      ok: true,
      data: {
        sessionId: updated.id,
        status: updated.status,
        intent,
        touchedPaths: paths,
      },
    }
  },
})

register({
  id: 'import.intent.apply',
  label: 'Apply imported design',
  description:
    'Write the reviewed design intent into the project as shapes, pool fields, and notes. Transactional, one undo entry, one audit row.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    projectId: z.string(),
    appliedCommandIds: z.array(z.string()),
    createdShapeIds: z.array(z.string()),
  }),
  voiceExamples: ['Apply the imported design.', 'Build this into the project.'],
  // Track I4 (Review) owns the body, including the two hard gates: a null
  // pixelsPerInch blocks every footprint and derived dimension, and any field
  // below the review confidence threshold must be touched by a human first.
  execute: async () => ({ ok: false, error: 'not implemented: track I4 (review + apply)' }),
})

register({
  id: 'import.session.discard',
  label: 'Discard image import',
  description: 'Abandon an import session without writing anything into the project.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    status: z.enum(['DRAFT', 'READY', 'APPLIED', 'DISCARDED']),
  }),
  voiceExamples: ['Discard this import.', 'Cancel the import.'],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{
      sessionId: string
      status: 'DRAFT' | 'READY' | 'APPLIED' | 'DISCARDED'
    }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const existing = await db.importSession.findFirst({
      where: { id: input.sessionId, orgId: ctx.orgId },
      select: { id: true, status: true },
    })
    if (!existing) return { ok: false, error: 'Import session not found' }
    if (existing.status === 'APPLIED') {
      return { ok: false, error: 'An applied import cannot be discarded' }
    }

    const updated = await db.importSession.update({
      where: { id: existing.id },
      data: { status: 'DISCARDED' },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: updated.id, status: updated.status } }
  },
})
