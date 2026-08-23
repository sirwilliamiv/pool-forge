// Payload handoff from the upload route to the command registry.
//
// Same problem the image uploads have, same answer. `CLAUDE.md` is categorical
// that every user-driven action dispatches through `src/modules/commands/`, and
// command inputs are written verbatim into `CommandAuditLog`. A 60,000 cell
// capture is about a megabyte of JSON, and putting it in an audit row per
// upload would make the audit table the largest thing in the database while
// telling a reader nothing they could not get from the `SiteCapture` row.
//
// So the route parses and stages the document in process and dispatches an
// opaque single-use ref. The audit row records the ref, the project, and the
// summary the command returns, which is the part worth keeping.

import { randomBytes } from 'node:crypto'

export const CAPTURE_REF_PATTERN = /^cap_ref_[0-9a-f]{32}$/

/** Long enough for a slow ingest, short enough that a leak cannot accumulate. */
export const STAGED_CAPTURE_TTL_MS = 120_000

interface StagedCapture {
  payload: unknown
  orgId: string
  expiresAt: number
}

const staged = new Map<string, StagedCapture>()

function sweep(now: number): void {
  for (const [ref, entry] of staged) {
    if (entry.expiresAt <= now) staged.delete(ref)
  }
}

export function stageCapture(input: { payload: unknown; orgId: string }): string {
  const now = Date.now()
  sweep(now)
  const ref = `cap_ref_${randomBytes(16).toString('hex')}`
  staged.set(ref, { payload: input.payload, orgId: input.orgId, expiresAt: now + STAGED_CAPTURE_TTL_MS })
  return ref
}

/**
 * Consume a staged capture.
 *
 * Null for unknown, expired, already consumed, or another organisation's ref.
 * One answer for all four: distinguishing them would tell a caller whether a
 * ref they guessed exists somewhere else.
 */
export function takeStagedCapture(ref: string, orgId: string): unknown | null {
  const now = Date.now()
  sweep(now)
  const entry = staged.get(ref)
  if (!entry) return null
  staged.delete(ref)
  if (entry.orgId !== orgId) return null
  if (entry.expiresAt <= now) return null
  return entry.payload
}

export function discardStagedCapture(ref: string): void {
  staged.delete(ref)
}

/** Test seam. */
export function resetStagedCaptures(): void {
  staged.clear()
}
