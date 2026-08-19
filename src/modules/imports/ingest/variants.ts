// Resolving the vision copy and the thumbnail of an already-ingested image.
//
// `SourceImage` stores one `storageKey`. The other two blobs are content
// addressed, so their keys are a pure function of the original's bytes: the
// pipeline reproduces them exactly, and `BlobStore.put` is a no-op when the
// object is already there. Re-deriving is therefore always safe and always
// self-consistent, which is what lets an org-scoped read route hand out a
// thumbnail without a database column to look it up in.
//
// The map below is a cache, never a source of truth. A cold process simply
// pays one decode on the first thumbnail request.

import { getBlobStore } from '@/modules/storage'

import { logIngestFailure } from './errors'
import { storeDerivatives, type StoredBlobRef } from './index'
import { sniffMimeType } from './sniff'
import { IngestRejection } from './types'

export const IMAGE_VARIANTS = ['original', 'vision', 'thumbnail'] as const
export type ImageVariant = (typeof IMAGE_VARIANTS)[number]

interface CachedDerivatives {
  vision: StoredBlobRef
  thumbnail: StoredBlobRef
}

const cache = new Map<string, CachedDerivatives>()

/** Test seam, and the hook a future cache-invalidation path would use. */
export function resetVariantCache(): void {
  cache.clear()
}

export interface ResolvedVariant {
  storageKey: string
  mimeType: string
  data: Buffer
}

async function deriveFrom(originalKey: string): Promise<CachedDerivatives & { data: Buffer }> {
  const store = getBlobStore()
  const originalBytes = await store.get(originalKey)
  const sniffed = sniffMimeType(originalBytes)
  if (!sniffed) {
    const ref = logIngestFailure('variant derive', `stored blob is not a supported type`)
    throw new IngestRejection('CORRUPT', `That image could not be read (ref ${ref}).`)
  }
  const stored = await storeDerivatives(originalBytes, sniffed)
  const entry: CachedDerivatives = { vision: stored.vision, thumbnail: stored.thumbnail }
  cache.set(originalKey, entry)
  return { ...entry, data: originalBytes }
}

/**
 * Resolves one variant of an image whose original lives at `originalKey`.
 *
 * The caller is responsible for having proved, against an org-scoped
 * `SourceImage` row, that this org may read this image. Nothing here does
 * authorization: a storage key on its own is never a capability.
 */
export async function resolveVariant(
  originalKey: string,
  originalMimeType: string,
  variant: ImageVariant,
): Promise<ResolvedVariant> {
  const store = getBlobStore()

  if (variant === 'original') {
    return { storageKey: originalKey, mimeType: originalMimeType, data: await store.get(originalKey) }
  }

  const cached = cache.get(originalKey)
  if (cached) {
    const ref = variant === 'vision' ? cached.vision : cached.thumbnail
    if (await store.exists(ref.storageKey)) {
      return { storageKey: ref.storageKey, mimeType: ref.mimeType, data: await store.get(ref.storageKey) }
    }
    cache.delete(originalKey)
  }

  const derived = await deriveFrom(originalKey)
  const ref = variant === 'vision' ? derived.vision : derived.thumbnail
  return { storageKey: ref.storageKey, mimeType: ref.mimeType, data: await store.get(ref.storageKey) }
}

/** The vision-copy key for an already-stored original, deriving it if needed. */
export async function resolveVisionBlob(originalKey: string): Promise<StoredBlobRef> {
  const cached = cache.get(originalKey)
  if (cached) {
    const store = getBlobStore()
    if (await store.exists(cached.vision.storageKey)) return cached.vision
    cache.delete(originalKey)
  }
  const derived = await deriveFrom(originalKey)
  return derived.vision
}
