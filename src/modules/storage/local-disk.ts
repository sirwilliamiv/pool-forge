import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
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

export const DEFAULT_LOCAL_BLOB_DIR = '.data/blobs'

/**
 * Local-disk driver. Content-addressed: writing the same bytes twice is a
 * no-op that returns the existing key, which is what makes upload dedupe and
 * the analysis cache free.
 */
export class LocalDiskBlobStore implements BlobStore {
  private readonly root: string

  constructor(rootDir: string = DEFAULT_LOCAL_BLOB_DIR) {
    this.root = resolve(rootDir)
  }

  /** Absolute path for a key, refusing anything that escapes the blob root. */
  private pathFor(storageKey: string): string {
    if (!isStorageKey(storageKey)) throw new InvalidStorageKeyError(storageKey)
    const full = resolve(join(this.root, storageKey))
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new InvalidStorageKeyError(storageKey)
    }
    return full
  }

  async put(input: PutBlobInput): Promise<PutBlobResult> {
    const sha256 = createHash('sha256').update(input.data).digest('hex')
    const storageKey = storageKeyFor(sha256, input.mimeType)
    const full = this.pathFor(storageKey)

    const already = await this.exists(storageKey)
    if (!already) {
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, input.data)
    }

    return {
      storageKey,
      sha256,
      bytes: input.data.byteLength,
      mimeType: input.mimeType,
      created: !already,
    }
  }

  async get(storageKey: string): Promise<Buffer> {
    const full = this.pathFor(storageKey)
    try {
      return await readFile(full)
    } catch {
      throw new BlobNotFoundError(storageKey)
    }
  }

  async getStream(storageKey: string): Promise<Readable> {
    const full = this.pathFor(storageKey)
    if (!(await this.exists(storageKey))) throw new BlobNotFoundError(storageKey)
    return createReadStream(full)
  }

  async delete(storageKey: string): Promise<void> {
    const full = this.pathFor(storageKey)
    await rm(full, { force: true })
  }

  async exists(storageKey: string): Promise<boolean> {
    const full = this.pathFor(storageKey)
    try {
      const info = await stat(full)
      return info.isFile()
    } catch {
      return false
    }
  }
}
