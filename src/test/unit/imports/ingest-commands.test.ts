// Integration: these hit the real local Postgres (`pnpm db:up`) and the real
// local-disk BlobStore. Prisma is never mocked, per repo convention.
//
// Every unique-indexed value interpolates the run-scoped org id, so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'
import {
  setVisionAnalysisPort,
  type VisionAnalysisPort,
} from '@/modules/imports/analysis-port'
import { ingestImage } from '@/modules/imports/ingest'
import { decodeRejection, statusForRejection } from '@/modules/imports/ingest/rejection'
import { stageUpload } from '@/modules/imports/ingest/staging'
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_SESSION,
  type IngestInput,
} from '@/modules/imports/ingest/types'
import { resetVariantCache } from '@/modules/imports/ingest/variants'
import { emptyDesignIntent, type DesignIntent } from '@/modules/imports/intent'
import { getBlobStore, resetBlobStore } from '@/modules/storage'

import { onePagePdf, solidJpeg, solidPng } from './image-fixtures'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('ingest integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

interface SessionData {
  sessionId: string
  intent: DesignIntent
}

interface UploadData {
  sessionId: string
  sourceImageId: string
  sha256: string
  deduped: boolean
  widthPx: number
  heightPx: number
  storageKey: string
  visionKey: string
  thumbnailKey: string
  sourceImageIds: string[]
}

describe.skipIf(!reachable)('image ingest', () => {
  let blobRoot = ''
  let orgA = ''
  let orgB = ''
  let userId = ''
  let projectA = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  const baseInput = (bytes: Buffer, orgId: string): IngestInput => ({
    bytes,
    declaredMimeType: null,
    orgId,
    projectId: null,
    origin: 'BUILDER',
    uploadedBy: null,
  })

  beforeAll(async () => {
    initCommands()

    blobRoot = await mkdtemp(join(tmpdir(), 'poolforge-ingest-'))
    process.env.BLOB_STORE_DRIVER = 'local'
    process.env.BLOB_STORE_LOCAL_DIR = blobRoot
    resetBlobStore()
    resetVariantCache()

    const a = await db.organization.create({ data: { name: `Ingest A ${RUN}` } })
    const b = await db.organization.create({ data: { name: `Ingest B ${RUN}` } })
    orgA = a.id
    orgB = b.id

    const user = await db.user.create({
      data: { email: `ingest-${RUN}-${orgA}@example.test`, passwordHash: 'x' },
    })
    userId = user.id
    await db.organizationMember.create({ data: { userId, orgId: orgA } })
    await db.organizationMember.create({ data: { userId, orgId: orgB } })

    projectA = (await db.project.create({ data: { orgId: orgA, name: `Ingest A ${RUN}` } })).id

    ctxA = { userId, orgId: orgA }
    ctxB = { userId, orgId: orgB }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: userId } })
    resetBlobStore()
    resetVariantCache()
    if (blobRoot) await rm(blobRoot, { recursive: true, force: true })
  })

  describe('ingestImage', () => {
    it('writes three blobs and a SourceImage row with kind UNKNOWN', async () => {
      const bytes = await solidPng({ seed: 11, width: 800, height: 400 })
      const result = await ingestImage({
        ...baseInput(bytes, orgA),
        projectId: projectA,
        uploadedBy: userId,
      })

      expect(result.deduped).toBe(false)
      expect(result.mimeType).toBe('image/png')
      expect(result.widthPx).toBe(800)
      expect(result.heightPx).toBe(400)

      const store = getBlobStore()
      expect(await store.exists(result.storageKey)).toBe(true)
      expect(await store.exists(result.visionKey)).toBe(true)
      expect(await store.exists(result.thumbnailKey)).toBe(true)

      const row = await db.sourceImage.findFirst({
        where: { id: result.sourceImageId, orgId: orgA },
      })
      expect(row?.kind).toBe('UNKNOWN')
      expect(row?.origin).toBe('BUILDER')
      expect(row?.projectId).toBe(projectA)
      expect(row?.uploadedBy).toBe(userId)
      expect(row?.storageKey).toBe(result.storageKey)
      expect(row?.bytes).toBe(bytes.byteLength)
    })

    it('dedupes the same bytes within one org to a single row', async () => {
      const bytes = await solidPng({ seed: 12 })

      const first = await ingestImage(baseInput(bytes, orgA))
      const second = await ingestImage(baseInput(bytes, orgA))

      expect(first.deduped).toBe(false)
      expect(second.deduped).toBe(true)
      expect(second.sourceImageId).toBe(first.sourceImageId)
      expect(second.visionKey).toBe(first.visionKey)
      expect(second.thumbnailKey).toBe(first.thumbnailKey)

      const rows = await db.sourceImage.findMany({
        where: { orgId: orgA, sha256: first.sha256 },
      })
      expect(rows).toHaveLength(1)
    })

    it('does not dedupe across orgs: two orgs get two rows', async () => {
      const bytes = await solidPng({ seed: 13 })

      const inA = await ingestImage(baseInput(bytes, orgA))
      const inB = await ingestImage(baseInput(bytes, orgB))

      expect(inA.sha256).toBe(inB.sha256)
      expect(inB.deduped).toBe(false)
      expect(inB.sourceImageId).not.toBe(inA.sourceImageId)

      expect(await db.sourceImage.count({ where: { orgId: orgA, sha256: inA.sha256 } })).toBe(1)
      expect(await db.sourceImage.count({ where: { orgId: orgB, sha256: inA.sha256 } })).toBe(1)
    })

    it('rejects an empty buffer', async () => {
      await expect(ingestImage(baseInput(Buffer.alloc(0), orgA))).rejects.toMatchObject({
        name: 'IngestRejection',
        code: 'EMPTY',
      })
    })

    it('rejects an oversized buffer before decoding it', async () => {
      const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x41)
      await expect(ingestImage(baseInput(oversized, orgA))).rejects.toMatchObject({
        name: 'IngestRejection',
        code: 'TOO_LARGE',
      })
    })

    it('rejects a file whose declared type lies about its bytes', async () => {
      const executable = Buffer.concat([
        Buffer.from('MZ', 'latin1'),
        Buffer.alloc(126, 0x00),
        Buffer.from('PE\0\0', 'latin1'),
      ])
      await expect(
        ingestImage({
          ...baseInput(executable, orgA),
          declaredMimeType: 'image/png',
        }),
      ).rejects.toMatchObject({ name: 'IngestRejection', code: 'UNSUPPORTED_TYPE' })

      expect(await db.sourceImage.count({ where: { orgId: orgA, mimeType: 'image/png', bytes: executable.byteLength } })).toBe(0)
    })

    it('refuses a project belonging to another org', async () => {
      const bytes = await solidPng({ seed: 14 })
      await expect(
        ingestImage({ ...baseInput(bytes, orgB), projectId: projectA }),
      ).rejects.toMatchObject({ name: 'IngestRejection' })
    })

    it('stores a PDF as-is and records the rasterized page dimensions', async () => {
      const pdf = onePagePdf(`Plat ${RUN}`)
      const result = await ingestImage(baseInput(pdf, orgA))

      expect(result.mimeType).toBe('application/pdf')
      expect(result.widthPx).toBeGreaterThan(0)
      expect(result.heightPx).toBeGreaterThan(0)

      const stored = await getBlobStore().get(result.storageKey)
      expect(stored.equals(pdf)).toBe(true)
      expect(result.visionKey).not.toBe(result.storageKey)
    })
  })

  describe('import.image.upload', () => {
    async function newSession(): Promise<string> {
      const created = await dispatchCommand<SessionData>(
        'import.session.create',
        { projectId: projectA },
        ctxA,
      )
      if (!created.ok) throw new Error(created.error)
      return created.data.sessionId
    }

    async function upload(
      sessionId: string,
      bytes: Buffer,
      ctx: CommandContext = ctxA,
    ): Promise<CommandResult<UploadData>> {
      const uploadRef = stageUpload({ bytes, declaredMimeType: 'image/png', orgId: ctx.orgId })
      return dispatchCommand<UploadData>(
        'import.image.upload',
        { sessionId, uploadRef, origin: 'BUILDER' },
        ctx,
      )
    }

    it('attaches the image to the session and writes an audit row', async () => {
      const sessionId = await newSession()
      const before = await db.commandAuditLog.count({
        where: { orgId: orgA, commandId: 'import.image.upload' },
      })

      const result = await upload(sessionId, await solidPng({ seed: 21 }))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.data.sourceImageIds).toEqual([result.data.sourceImageId])

      const session = await db.importSession.findFirst({ where: { id: sessionId, orgId: orgA } })
      const intent = session?.designIntentJson as unknown as DesignIntent
      expect(intent.sourceImageIds).toEqual([result.data.sourceImageId])

      const after = await db.commandAuditLog.count({
        where: { orgId: orgA, commandId: 'import.image.upload' },
      })
      expect(after).toBe(before + 1)
    })

    it('burns the upload ref, so a replay is refused', async () => {
      const sessionId = await newSession()
      const bytes = await solidJpeg({ seed: 22 })
      const uploadRef = stageUpload({ bytes, declaredMimeType: null, orgId: orgA })

      const first = await dispatchCommand('import.image.upload', { sessionId, uploadRef }, ctxA)
      expect(first.ok).toBe(true)

      const replay = await dispatchCommand('import.image.upload', { sessionId, uploadRef }, ctxA)
      expect(replay.ok).toBe(false)
    })

    it('refuses a ref staged by another org', async () => {
      const sessionId = await newSession()
      const uploadRef = stageUpload({
        bytes: await solidPng({ seed: 23 }),
        declaredMimeType: null,
        orgId: orgB,
      })
      const result = await dispatchCommand('import.image.upload', { sessionId, uploadRef }, ctxA)
      expect(result.ok).toBe(false)
    })

    it('refuses a session belonging to another org', async () => {
      const sessionId = await newSession()
      const result = await upload(sessionId, await solidPng({ seed: 24 }), ctxB)
      expect(result).toEqual({ ok: false, error: 'Import session not found' })
    })

    it(`enforces MAX_IMAGES_PER_SESSION (${MAX_IMAGES_PER_SESSION})`, async () => {
      const sessionId = await newSession()

      for (let i = 0; i < MAX_IMAGES_PER_SESSION; i += 1) {
        const result = await upload(sessionId, await solidPng({ seed: 100 + i }))
        expect(result.ok, `upload ${i} should succeed`).toBe(true)
      }

      const overflow = await upload(sessionId, await solidPng({ seed: 999 }))
      expect(overflow.ok).toBe(false)
      if (overflow.ok) return

      const rejection = decodeRejection(overflow.error)
      expect(rejection?.code).toBe('TOO_MANY')
      expect(statusForRejection('TOO_MANY')).toBe(409)
    })

    it('surfaces an unsupported type as a decodable rejection code', async () => {
      const sessionId = await newSession()
      const result = await upload(sessionId, Buffer.from('definitely not an image', 'utf8'))
      expect(result.ok).toBe(false)
      if (result.ok) return

      const rejection = decodeRejection(result.error)
      expect(rejection?.code).toBe('UNSUPPORTED_TYPE')
      expect(statusForRejection('UNSUPPORTED_TYPE')).toBe(415)
      // The user-facing half never names the file or a library.
      expect(rejection?.message).not.toMatch(/sharp|vips|pdfium/i)
    })

    it('a dedupe hit still attaches exactly one id to the session', async () => {
      const sessionId = await newSession()
      const bytes = await solidPng({ seed: 25 })

      const first = await upload(sessionId, bytes)
      const second = await upload(sessionId, bytes)
      expect(first.ok && second.ok).toBe(true)
      if (!first.ok || !second.ok) return

      expect(second.data.deduped).toBe(true)
      expect(second.data.sourceImageIds).toEqual([first.data.sourceImageId])
    })
  })

  describe('import.image.analyze', () => {
    it('persists an ImageAnalysis row through the vision port and caches on it', async () => {
      const created = await dispatchCommand<SessionData>('import.session.create', {}, ctxA)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const sessionId = created.data.sessionId

      const uploadRef = stageUpload({
        bytes: await solidPng({ seed: 31 }),
        declaredMimeType: null,
        orgId: orgA,
      })
      const uploaded = await dispatchCommand<UploadData>(
        'import.image.upload',
        { sessionId, uploadRef },
        ctxA,
      )
      expect(uploaded.ok).toBe(true)
      if (!uploaded.ok) return
      const sourceImageId = uploaded.data.sourceImageId

      const fake: VisionAnalysisPort = {
        extractorVersion: `test-${RUN}`,
        analyze: async (request) => {
          expect(request.orgId).toBe(orgA)
          expect(request.visionKey).toBeTruthy()
          return {
            extractorVersion: `test-${RUN}`,
            kind: 'SKETCH',
            intent: {
              ...emptyDesignIntent(request.intent.sourceImageIds),
              pool: { ...emptyDesignIntent().pool, shapeFamily: 'kidney' },
            },
            stages: [
              {
                stage: 'CLASSIFY',
                status: 'OK',
                model: 'fake-1',
                promptHash: 'hash-1',
                raw: { kind: 'SKETCH' },
                parsed: { kind: 'SKETCH' },
                tokensIn: 7,
                tokensOut: 3,
                latencyMs: 12,
                errorRef: null,
              },
            ],
          }
        },
      }

      setVisionAnalysisPort(fake)
      try {
        const first = await dispatchCommand<{ cached: boolean; intent: DesignIntent }>(
          'import.image.analyze',
          { sessionId, sourceImageId },
          ctxA,
        )
        expect(first.ok).toBe(true)
        if (!first.ok) return
        expect(first.data.cached).toBe(false)
        expect(first.data.intent.pool.shapeFamily).toBe('kidney')

        const row = await db.imageAnalysis.findFirst({
          where: { sourceImageId, extractorVersion: `test-${RUN}`, stage: 'CLASSIFY' },
        })
        expect(row?.status).toBe('OK')
        expect(row?.model).toBe('fake-1')
        expect(row?.tokensIn).toBe(7)

        const image = await db.sourceImage.findFirst({ where: { id: sourceImageId, orgId: orgA } })
        expect(image?.kind).toBe('SKETCH')

        const second = await dispatchCommand<{ cached: boolean }>(
          'import.image.analyze',
          { sessionId, sourceImageId },
          ctxA,
        )
        expect(second.ok).toBe(true)
        if (second.ok) expect(second.data.cached).toBe(true)

        const crossOrg = await dispatchCommand(
          'import.image.analyze',
          { sessionId, sourceImageId },
          ctxB,
        )
        expect(crossOrg).toEqual({ ok: false, error: 'Import session not found' })
      } finally {
        setVisionAnalysisPort(null)
      }
    })

    it('falls back to the no-op port without pretending it succeeded', async () => {
      const created = await dispatchCommand<SessionData>('import.session.create', {}, ctxA)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const sessionId = created.data.sessionId

      const uploadRef = stageUpload({
        bytes: await solidPng({ seed: 32 }),
        declaredMimeType: null,
        orgId: orgA,
      })
      const uploaded = await dispatchCommand<UploadData>(
        'import.image.upload',
        { sessionId, uploadRef },
        ctxA,
      )
      expect(uploaded.ok).toBe(true)
      if (!uploaded.ok) return

      const result = await dispatchCommand<{ intent: DesignIntent }>(
        'import.image.analyze',
        { sessionId, sourceImageId: uploaded.data.sourceImageId },
        ctxA,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.data.intent.warnings).toContain('No vision extractor is configured.')
      const row = await db.imageAnalysis.findFirst({
        where: { sourceImageId: uploaded.data.sourceImageId, extractorVersion: 'noop-v0' },
      })
      expect(row?.status).toBe('PENDING')
    })
  })
})
