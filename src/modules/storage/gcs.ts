import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'

import {
  BlobNotFoundError,
  InvalidStorageKeyError,
  isStorageKey,
  storageKeyFor,
  type BlobStore,
  type PutBlobInput,
  type PutBlobResult,
} from './types'

// The same store, in a bucket.
//
// Cloud Run's filesystem is empty on every cold start and unshared between
// instances, so the local-disk driver there is not storage, it is a cache that
// looks like storage until the first restart takes a customer's signed proposal
// with it. This is the driver that makes the deployed app keep what it filed.
//
// The key format was designed for this: `ab/cd/<sha256>.png` is already a valid
// object name, so nothing about addressing changes and nothing stored by one
// driver is unreadable by the other.

/** Imported lazily so a deployment using local disk never loads the SDK. */
type StorageModule = typeof import('@google-cloud/storage')

export interface GcsBlobStoreOptions {
  bucket: string
  /** Defaults to the runtime's application credentials, which is what Cloud Run supplies. */
  projectId?: string
}

export class GcsBlobStore implements BlobStore {
  private readonly bucketName: string
  private readonly projectId: string | undefined
  private bucket: Awaited<ReturnType<GcsBlobStore['resolveBucket']>> | null = null

  constructor(options: GcsBlobStoreOptions) {
    if (!options.bucket.trim()) {
      throw new Error('A bucket name is required to store files in Cloud Storage.')
    }
    this.bucketName = options.bucket.trim()
    this.projectId = options.projectId?.trim() || undefined
  }

  private async resolveBucket() {
    const { Storage }: StorageModule = await import('@google-cloud/storage')
    const storage = this.projectId ? new Storage({ projectId: this.projectId }) : new Storage()
    return storage.bucket(this.bucketName)
  }

  private async handle(storageKey: string) {
    if (!isStorageKey(storageKey)) throw new InvalidStorageKeyError(storageKey)
    if (!this.bucket) this.bucket = await this.resolveBucket()
    return this.bucket.file(storageKey)
  }

  /**
   * Write, unless the same bytes are already there.
   *
   * Content addressed, so an identical upload is a no-op rather than a second
   * object. `created` tells the caller which happened, the same way the local
   * driver does, because a caller counting writes should not have to know which
   * driver it is talking to.
   */
  async put(input: PutBlobInput): Promise<PutBlobResult> {
    const sha256 = createHash('sha256').update(input.data).digest('hex')
    const storageKey = storageKeyFor(sha256, input.mimeType)
    const file = await this.handle(storageKey)

    const [existing] = await file.exists()
    if (existing) {
      return { storageKey, sha256, bytes: input.data.byteLength, mimeType: input.mimeType, created: false }
    }

    await file.save(input.data, {
      contentType: input.mimeType,
      resumable: false,
      // The object never changes, because its name is its hash. Caching it
      // forever is safe and saves a round trip on every proposal reopened.
      metadata: { cacheControl: 'private, max-age=31536000, immutable' },
    })

    return { storageKey, sha256, bytes: input.data.byteLength, mimeType: input.mimeType, created: true }
  }

  async get(storageKey: string): Promise<Buffer> {
    const file = await this.handle(storageKey)
    try {
      const [contents] = await file.download()
      return contents
    } catch (cause) {
      if (isMissing(cause)) throw new BlobNotFoundError(storageKey)
      throw cause
    }
  }

  async getStream(storageKey: string): Promise<Readable> {
    const file = await this.handle(storageKey)
    // Checked first so a missing object is the same error on both drivers,
    // rather than a stream that opens and then emits.
    if (!(await this.exists(storageKey))) throw new BlobNotFoundError(storageKey)
    return file.createReadStream()
  }

  async delete(storageKey: string): Promise<void> {
    const file = await this.handle(storageKey)
    try {
      await file.delete()
    } catch (cause) {
      // Already gone is the outcome the caller asked for.
      if (isMissing(cause)) return
      throw cause
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const file = await this.handle(storageKey)
    const [found] = await file.exists()
    return found
  }
}

/** A 404 from the API, whatever shape the SDK wrapped it in. */
function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: number }).code === 404
}
