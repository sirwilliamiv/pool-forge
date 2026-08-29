// Driver selection lives here so callers never name a driver.

import { GcsBlobStore } from './gcs'
import { DEFAULT_LOCAL_BLOB_DIR, LocalDiskBlobStore } from './local-disk'
import type { BlobStore } from './types'

export type BlobStoreDriver = 'local' | 'gcs'

export {
  BlobNotFoundError,
  InvalidStorageKeyError,
  extensionForMimeType,
  isStorageKey,
  storageKeyFor,
  STORAGE_KEY_PATTERN,
} from './types'
export type { BlobStore, PutBlobInput, PutBlobResult } from './types'
export { LocalDiskBlobStore, DEFAULT_LOCAL_BLOB_DIR } from './local-disk'
export { GcsBlobStore } from './gcs'

let _cached: BlobStore | null = null

function readDriver(): BlobStoreDriver {
  const raw = (process.env.BLOB_STORE_DRIVER ?? 'local').trim().toLowerCase()
  if (raw === 'local' || raw === '') return 'local'
  if (raw === 'gcs') return 'gcs'
  throw new Error(`Unsupported BLOB_STORE_DRIVER: ${raw}`)
}

function build(): BlobStore {
  switch (readDriver()) {
    case 'local':
      return new LocalDiskBlobStore(
        (process.env.BLOB_STORE_LOCAL_DIR ?? '').trim() || DEFAULT_LOCAL_BLOB_DIR,
      )
    case 'gcs': {
      // Named rather than defaulted. A bucket name guessed from a project id
      // would silently write a builder's documents into whatever that resolved
      // to, which is worse than refusing to start.
      const bucket = (process.env.BLOB_STORE_BUCKET ?? '').trim()
      if (!bucket) {
        throw new Error('Cloud Storage is selected but no bucket is named. Set BLOB_STORE_BUCKET.')
      }
      const projectId = (process.env.GCP_PROJECT_ID ?? '').trim()
      return new GcsBlobStore(projectId ? { bucket, projectId } : { bucket })
    }
  }
}

/** Process-wide singleton. `resetBlobStore()` exists for tests. */
export function getBlobStore(): BlobStore {
  if (!_cached) _cached = build()
  return _cached
}

export function resetBlobStore(): void {
  _cached = null
}
