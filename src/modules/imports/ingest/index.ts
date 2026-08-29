// The ingest seam, made real.
//
// Every byte that enters Pool Forge from outside the process comes through
// `ingestImage`: the builder upload route, the public intake funnel, and any
// future importer. A second path that skips this is a security bug, because
// this is the only place magic-byte sniffing, the EXIF strip, the size cap, and
// org-scoped dedupe happen.
//
// Order matters and is deliberate:
//
//   1. cheap rejects (empty, oversize) before a decoder ever sees the buffer
//   2. magic-byte sniff, so a mislabeled file is refused rather than decoded
//   3. sha256 of the *submitted* bytes, then an org-scoped dedupe lookup
//   4. EXIF strip, before anything is written or sent anywhere
//   5. real pixel dimensions read off the decode, never off claimed metadata
//   6. three blobs written: stripped original, vision copy, thumbnail

import { createHash } from 'node:crypto'

import { getBlobStore } from '@/modules/storage'

import { logIngestFailure } from './errors'
import { prepareImage, type PreparedBlob, type PreparedImage } from './pipeline'
import { sniffMimeType } from './sniff'
import {
  IngestRejection,
  MAX_IMAGE_BYTES,
  type AllowedMimeType,
  type IngestInput,
  type IngestResult,
} from './types'

export { MIN_SNIFF_BYTES, isMislabeled, sniffMimeType } from './sniff'
export { THUMBNAIL_MAX_EDGE_PX, prepareImage } from './pipeline'
export { PDF_RASTER_MAX_EDGE_PX, rasterizeFirstPage } from './pdf'
export { ERROR_REF_PATTERN, logIngestFailure, newErrorRef } from './errors'
export * from './types'

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Derivative blob keys for an already-ingested image.
 *
 * `SourceImage` carries one `storageKey`, the original. The vision copy and the
 * thumbnail are content-addressed like everything else, so their keys are a
 * deterministic function of the original bytes rather than something to store:
 * re-deriving reproduces the same keys, and `BlobStore.put` is a no-op when the
 * object already exists. That is why a dedupe hit still runs the pipeline. It
 * costs one decode and two resizes, and it self-heals a blob directory that was
 * pruned underneath the database.
 */
export interface StoredBlobRef {
  storageKey: string
  mimeType: string
  bytes: number
}

export interface StoredDerivatives {
  original: StoredBlobRef
  vision: StoredBlobRef
  thumbnail: StoredBlobRef
  widthPx: number
  heightPx: number
  /** The buffers just written, so a caller serving one does not re-read it. */
  prepared: PreparedImage
}

function refOf(blob: PreparedBlob, storageKey: string): StoredBlobRef {
  return { storageKey, mimeType: blob.mimeType, bytes: blob.data.byteLength }
}

/** Decodes, strips, downscales, and writes all three blobs. Idempotent. */
export async function storeDerivatives(
  bytes: Buffer,
  sniffed: AllowedMimeType,
): Promise<StoredDerivatives> {
  const prepared = await prepareImage(bytes, sniffed)
  const store = getBlobStore()

  try {
    const [original, vision, thumbnail] = await Promise.all([
      store.put({ data: prepared.original.data, mimeType: prepared.original.mimeType }),
      store.put({ data: prepared.vision.data, mimeType: prepared.vision.mimeType }),
      store.put({ data: prepared.thumbnail.data, mimeType: prepared.thumbnail.mimeType }),
    ])

    return {
      original: refOf(prepared.original, original.storageKey),
      vision: refOf(prepared.vision, vision.storageKey),
      thumbnail: refOf(prepared.thumbnail, thumbnail.storageKey),
      widthPx: prepared.widthPx,
      heightPx: prepared.heightPx,
      prepared,
    }
  } catch (err) {
    const ref = logIngestFailure('blob write', err)
    throw new IngestRejection('CORRUPT', `That image could not be stored (ref ${ref}).`)
  }
}

/**
 * Registers uploaded bytes as a `SourceImage`.
 *
 * `kind` is always written as `UNKNOWN`: classification is Track I2's vision
 * call, and guessing it here from a filename or a content type would be exactly
 * the header-trusting this module exists to prevent.
 */
export async function ingestImage(input: IngestInput): Promise<IngestResult> {
  const bytes = input.bytes

  if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) {
    throw new IngestRejection('EMPTY', 'That file is empty.')
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new IngestRejection(
      'TOO_LARGE',
      `That file is larger than the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit.`,
    )
  }
  if (!input.orgId) {
    throw new IngestRejection('CORRUPT', 'No organization in scope for this upload.')
  }

  const sniffed = sniffMimeType(bytes)
  if (!sniffed) {
    throw new IngestRejection(
      'UNSUPPORTED_TYPE',
      'That file is not a supported image. Upload a JPEG, PNG, WebP, HEIC, or PDF.',
    )
  }

  const sha256 = sha256Hex(bytes)
  const { db } = await import('@/lib/db')

  // Org-scoped by construction. Two organizations uploading byte-identical
  // images get two rows: cross-org data is never shared, not even implicitly
  // through a shared row that both could then read.
  const existing = await db.sourceImage.findFirst({
    where: { orgId: input.orgId, sha256 },
    orderBy: { createdAt: 'asc' },
    select: { id: true, storageKey: true, mimeType: true, widthPx: true, heightPx: true },
  })

  const derived = await storeDerivatives(bytes, sniffed)

  if (existing) {
    return {
      sourceImageId: existing.id,
      sha256,
      deduped: true,
      widthPx: existing.widthPx,
      heightPx: existing.heightPx,
      mimeType: sniffed,
      storageKey: existing.storageKey,
      visionKey: derived.vision.storageKey,
      thumbnailKey: derived.thumbnail.storageKey,
    }
  }

  // A project may only be attached when it belongs to the same org.
  let projectId: string | null = null
  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId: input.orgId },
      select: { id: true },
    })
    if (!project) throw new IngestRejection('CORRUPT', 'That project was not found.')
    projectId = project.id
  }

  // `uploadedBy` is a foreign key. An id that is not a real member of this org
  // is dropped rather than failing the upload.
  let uploadedBy: string | null = null
  if (input.uploadedBy) {
    const member = await db.organizationMember.findFirst({
      where: { userId: input.uploadedBy, orgId: input.orgId },
      select: { userId: true },
    })
    uploadedBy = member?.userId ?? null
  }

  const created = await db.sourceImage.create({
    data: {
      orgId: input.orgId,
      projectId,
      kind: 'UNKNOWN',
      storageKey: derived.original.storageKey,
      mimeType: sniffed,
      bytes: bytes.byteLength,
      sha256,
      widthPx: derived.widthPx,
      heightPx: derived.heightPx,
      uploadedBy,
      origin: input.origin,
    },
    select: { id: true },
  })

  return {
    sourceImageId: created.id,
    sha256,
    deduped: false,
    widthPx: derived.widthPx,
    heightPx: derived.heightPx,
    mimeType: sniffed,
    storageKey: derived.original.storageKey,
    visionKey: derived.vision.storageKey,
    thumbnailKey: derived.thumbnail.storageKey,
  }
}
