// Byte handoff from an HTTP route to the command registry.
//
// `CLAUDE.md` is categorical: no route calls a domain module directly, every
// user-driven action dispatches through `src/modules/commands/`. But command
// inputs are JSON documents that get written verbatim into `CommandAuditLog`,
// and a 15MB upload base64s to 20MB of JSON per row. Neither "route does the
// ingest" nor "bytes travel inside the command input" is acceptable.
//
// So the route stages the buffer in process and passes an opaque single-use
// ref. The command resolves the ref and runs the ingest. The audit row records
// the ref, which is exactly the useful part: what was uploaded is already
// recorded as a `SourceImage` with a sha256.
//
// Refs are consumed once and expire quickly, so a leaked ref is not a way to
// replay someone else's bytes, and a route that throws before dispatching
// cannot pin a buffer in memory.

import { randomBytes } from 'node:crypto'

export const UPLOAD_REF_PATTERN = /^upl_[0-9a-f]{32}$/

/** Long enough for a slow dispatch, short enough that leaks cannot accumulate. */
export const STAGED_UPLOAD_TTL_MS = 60_000

export interface StagedUpload {
  bytes: Buffer
  declaredMimeType: string | null
  orgId: string
  expiresAt: number
}

const staged = new Map<string, StagedUpload>()

function sweep(now: number): void {
  for (const [ref, entry] of staged) {
    if (entry.expiresAt <= now) staged.delete(ref)
  }
}

export interface StageUploadInput {
  bytes: Buffer
  declaredMimeType: string | null
  /** The staging org. `takeStagedUpload` refuses a ref raised under another. */
  orgId: string
}

export function stageUpload(input: StageUploadInput): string {
  const now = Date.now()
  sweep(now)
  const ref = `upl_${randomBytes(16).toString('hex')}`
  staged.set(ref, {
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
    orgId: input.orgId,
    expiresAt: now + STAGED_UPLOAD_TTL_MS,
  })
  return ref
}

/**
 * Consumes a staged upload. Returns `null` for an unknown, expired, already
 * consumed, or cross-org ref, all of which are the same answer to the caller.
 */
export function takeStagedUpload(ref: string, orgId: string): StagedUpload | null {
  const now = Date.now()
  sweep(now)
  const entry = staged.get(ref)
  if (!entry) return null
  staged.delete(ref)
  if (entry.orgId !== orgId) return null
  if (entry.expiresAt <= now) return null
  return entry
}

/** Drops a staged buffer the caller decided not to dispatch. */
export function discardStagedUpload(ref: string): void {
  staged.delete(ref)
}

/** Test seam. */
export function resetStagedUploads(): void {
  staged.clear()
}
