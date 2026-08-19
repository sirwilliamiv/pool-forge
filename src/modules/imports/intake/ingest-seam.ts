// The intake funnel's single call into Track I1's byte handling.
//
// Nothing in this track sniffs magic bytes, strips EXIF, downscales, hashes, or
// writes a blob. All of that is `ingestImage`, which Track I1 owns in
// `src/modules/imports/ingest/`. A second byte path that skips it would be a
// security bug, not a shortcut: it is where EXIF GPS is stripped off a
// homeowner's backyard photo and where the declared Content-Type stops being
// trusted.
//
// I1 has not merged onto this branch, so only the contract in
// `ingest/types.ts` exists here. Rather than fake an implementation or import a
// module that is not on disk, the function is resolved through this one-slot
// registry. Until it is filled, the public route answers with the generic
// "temporarily unavailable" copy and logs a correlation ref, which is the
// correct behaviour for a dependency that is genuinely absent.

import type { IngestInput, IngestResult } from '@/modules/imports/ingest/types'

export type IngestImageFn = (input: IngestInput) => Promise<IngestResult>

let _impl: IngestImageFn | null = null

/**
 * When Track I1 merges, this whole file collapses to one line:
 *
 *     export { ingestImage } from '@/modules/imports/ingest'
 *
 * Nothing else in this track changes. Every caller already goes through the
 * `ingestImage` name exported here, with I1's exact signature. The single
 * marked call site is in `handler.ts`.
 */
export function setIngestImageImpl(fn: IngestImageFn | null): void {
  _impl = fn
}

export function hasIngestImageImpl(): boolean {
  return _impl !== null
}

/** Thrown when I1's implementation is not wired up in this process. */
export class IngestUnavailableError extends Error {
  constructor() {
    super('Image ingest is not available in this build.')
    this.name = 'IngestUnavailableError'
  }
}

export async function ingestImage(input: IngestInput): Promise<IngestResult> {
  if (_impl === null) throw new IngestUnavailableError()
  return _impl(input)
}
