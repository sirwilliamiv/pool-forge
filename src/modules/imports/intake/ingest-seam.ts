// The intake funnel's single call into Track I1's byte handling.
//
// Nothing in this track sniffs magic bytes, strips EXIF, downscales, hashes, or
// writes a blob. All of that is `ingestImage`, which Track I1 owns in
// `src/modules/imports/ingest/`. A second byte path that skips it would be a
// security bug, not a shortcut: it is where EXIF GPS is stripped off a
// homeowner's backyard photo and where the declared Content-Type stops being
// trusted.
//
// The indirection remains only so tests can substitute an implementation
// without decoding real rasters on every run. It defaults to the real one, so
// nothing has to be wired up for production behaviour to be correct.

import { ingestImage as realIngestImage } from '@/modules/imports/ingest'
import type { IngestInput, IngestResult } from '@/modules/imports/ingest/types'

export type IngestImageFn = (input: IngestInput) => Promise<IngestResult>

let _impl: IngestImageFn = realIngestImage

/** Test seam. Passing null restores the real implementation. */
export function setIngestImageImpl(fn: IngestImageFn | null): void {
  _impl = fn ?? realIngestImage
}

export function ingestImage(input: IngestInput): Promise<IngestResult> {
  return _impl(input)
}
