// Driver selection lives here so callers never name a driver. Adding the GCS
// driver (Wave 2 T8) is a new branch in this switch plus a new file: no
// callsite changes.

import { DEFAULT_LOCAL_BLOB_DIR, LocalDiskBlobStore } from './local-disk'
import type { BlobStore } from './types'

export type BlobStoreDriver = 'local'

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

let _cached: BlobStore | null = null

function readDriver(): BlobStoreDriver {
  const raw = (process.env.BLOB_STORE_DRIVER ?? 'local').trim().toLowerCase()
  if (raw === 'local' || raw === '') return 'local'
  throw new Error(`Unsupported BLOB_STORE_DRIVER: ${raw}`)
}

function build(): BlobStore {
  switch (readDriver()) {
    case 'local':
      return new LocalDiskBlobStore(
        (process.env.BLOB_STORE_LOCAL_DIR ?? '').trim() || DEFAULT_LOCAL_BLOB_DIR,
      )
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
