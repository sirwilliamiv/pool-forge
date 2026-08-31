// What the phone declares while it walks a backyard and streams the raw
// capture up in chunks.
//
// The prose version is `docs/backyard-capture-contract.md`; this file is the
// executable half and, as that doc says, the arbiter where the two disagree.
// This is a different contract from `src/modules/capture/contract.ts`: that
// one carries a finished heightfield computed on the phone, this one carries
// the raw bundle (frames, poses, opportunistic depth) so the cloud can
// reconstruct later.
//
// Two decisions worth stating, because the schemas follow from them:
//
//   1. Every id is client-generated and every write is idempotent on it. A
//      phone in a backyard is a client that loses signal mid-request, and the
//      retry must be the same session, the same chunk, not a duplicate.
//
//   2. The server never trusts a declared byte count or hash: they bound what
//      the ledger will accept and what the verify step compares against, and
//      a mismatch is a refusal with a sentence, never a parser's complaint.

import { z } from 'zod'

/**
 * The one number that says which contract this is. Bumped when a field
 * changes meaning, never when a field is added; the server refuses a version
 * it does not know rather than guessing.
 */
export const BUNDLE_CONTRACT_VERSION = 1

/**
 * The chunk size the recorder aims for, and the hard cap the register route
 * enforces.
 *
 * The recorder closes a chunk at ~24MB or ~50 frames, whichever first, but a
 * chunk is closed *after* the frame that crossed the line, so the cap allows
 * one full-resolution JPEG of margin and then some. A declared size above the
 * cap is a runaway recorder, not a big yard.
 */
export const CHUNK_TARGET_BYTES = 24 * 1024 * 1024
export const MAX_CHUNK_BYTES = 28 * 1024 * 1024

/**
 * Hard cap on chunks in one session.
 *
 * A long lap is ~10 minutes at 2 fps: ~1,200 frames, which is ~25 frame
 * chunks plus poses, depth and meta. 512 is more than an order of magnitude
 * of headroom (~12GB of bundle) while still bounding what one stolen token
 * can make the ledger and the bucket hold.
 */
export const MAX_CHUNKS_PER_SESSION = 512

/** A confirmed building footprint is corners, not a survey. */
export const MAX_FOOTPRINT_POINTS = 256

/** How many random bytes are behind a capture token: 20 bytes = 40 hex. */
export const CAPTURE_TOKEN_BYTES = 20

export const SESSION_ID_PATTERN = /^bcs_[0-9a-f]{32}$/
export const CAPTURE_TOKEN_PATTERN = /^pfc_[0-9a-f]{40}$/
const SHA256_HEX = /^[0-9a-f]{64}$/

export const sessionIdSchema = z
  .string()
  .regex(SESSION_ID_PATTERN, 'must be bcs_ followed by 32 hex characters')

export const captureTokenSchema = z
  .string()
  .regex(CAPTURE_TOKEN_PATTERN, 'must be pfc_ followed by 40 hex characters')

export const chunkKindSchema = z.enum(['frames', 'poses', 'depth', 'meta'])
export type ChunkKind = z.infer<typeof chunkKindSchema>

export const bundleDeviceSchema = z.object({
  model: z.string().min(1).max(60),
  osVersion: z.string().min(1).max(30),
  appVersion: z.string().min(1).max(30),
  hasLidar: z.boolean(),
})
export type BundleDevice = z.infer<typeof bundleDeviceSchema>

/** One footprint vertex, `[lat, lng]`, exactly as the doc's example writes it. */
const footprintPointSchema = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
])

/** `POST /api/mobile/capture/sessions` */
export const sessionCreateSchema = z.object({
  contractVersion: z.literal(BUNDLE_CONTRACT_VERSION),
  /** Client-generated, stable across retries of the same walk. */
  sessionId: sessionIdSchema,
  address: z.string().min(1).max(300),
  placeId: z.string().min(1).max(300).optional(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  /** The building footprint as confirmed or nudged on the site-confirm map. */
  footprint: z.array(footprintPointSchema).min(3).max(MAX_FOOTPRINT_POINTS).optional(),
  device: bundleDeviceSchema,
})
export type SessionCreate = z.infer<typeof sessionCreateSchema>

/** `POST /api/mobile/capture/sessions/:id/chunks` */
export const chunkRegisterSchema = z.object({
  seq: z.number().int().min(0).max(MAX_CHUNKS_PER_SESSION - 1),
  kind: chunkKindSchema,
  bytes: z.number().int().min(1).max(MAX_CHUNK_BYTES),
  /**
   * Declared at register time, stored in the ledger, and verified against the
   * uploaded bytes by the reconstruction worker. The complete-ack checks size
   * and existence, not content: see `gcs.ts` for why.
   */
  sha256: z.string().regex(SHA256_HEX, 'must be 64 lowercase hex characters'),
})
export type ChunkRegister = z.infer<typeof chunkRegisterSchema>

/**
 * `POST /api/mobile/capture/sessions/:id/finalize`
 *
 * The manifest is one number, because `seq` is global and contiguous: the app
 * declares the highest seq it wrote, and the server checks that 0..maxSeq are
 * all verified and that seq 0 is the meta chunk. On failure the response
 * carries `missingSeqs`, which is exactly the re-upload worklist.
 */
export const finalizeSchema = z.object({
  contractVersion: z.literal(BUNDLE_CONTRACT_VERSION),
  maxSeq: z.number().int().min(0).max(MAX_CHUNKS_PER_SESSION - 1),
})
export type Finalize = z.infer<typeof finalizeSchema>

/** The `:seq` path segment, which arrives as a string. */
export const seqParamSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(MAX_CHUNKS_PER_SESSION - 1)

/** Why a bundle request was refused. Carried to the route so it can pick a status. */
export type BundleRejectionCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'MALFORMED'
  | 'UNSUPPORTED_VERSION'
  | 'CONFLICT'
  | 'INCOMPLETE'
  | 'TOO_LARGE'
  | 'NOT_CONFIGURED'

/**
 * A refusal with a sentence attached, in the style of `CaptureRejection`.
 *
 * The sentence is what reaches the phone (and, via the app, a person), so it
 * says what happened and what to do. `detail` carries the machine-readable
 * part the app acts on - today that is `missingSeqs` on a failed finalize -
 * and is echoed into the response body alongside the sentence.
 */
export class BundleRejection extends Error {
  constructor(
    readonly code: BundleRejectionCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'BundleRejection'
  }
}

export function statusForBundleRejection(code: BundleRejectionCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'MALFORMED':
      return 400
    case 'UNSUPPORTED_VERSION':
    case 'CONFLICT':
    case 'INCOMPLETE':
      return 409
    case 'TOO_LARGE':
      return 413
    case 'NOT_CONFIGURED':
      return 503
  }
}
