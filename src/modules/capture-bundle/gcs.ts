// Where the bundle's bytes actually go: GCS resumable upload sessions,
// initiated server-side.
//
// Server-side rather than a signed URL, because signing needs a private key
// and service-account keys are org-blocked. `createResumableUpload` only
// needs the runtime's application default credentials - Cloud Run's service
// identity in deployment, `gcloud auth application-default login` locally -
// and hands back a session URI the phone can PUT to directly, with byte-range
// resume on every dropped connection. The URI embeds no credential; it is a
// capability for exactly one object, which is why handing it to the phone is
// fine and handing the phone a bucket-wide credential would not be.
//
// WHAT VERIFICATION MEANS HERE
//
// The complete-ack tells the phone it may delete its local copy, so it must
// mean "the server durably holds the bytes you sent". `verifyObject` checks
// existence and exact size, which is what a resumable upload can get wrong
// (a session finalized short). It does not re-hash content: the object is not
// downloaded, and GCS's own crc32c/md5 are hashes of what GCS received, with
// nothing client-declared to compare them against. The client-declared
// sha256 is stored in the ledger, and the reconstruction worker - the first
// thing that actually reads the bytes - verifies content against it before
// trusting a single frame. A corrupt-in-flight chunk is therefore caught
// before it can affect an output, just not at ack time.

import type { Bucket } from '@google-cloud/storage'

import type { ChunkKind } from './contract'

/** Imported lazily so nothing loads the SDK until a capture actually happens. */
type StorageModule = typeof import('@google-cloud/storage')

/** Trimmed because Secret Manager values can carry a trailing newline. */
function bucketName(): string | null {
  const raw = process.env.CAPTURE_BUNDLE_BUCKET
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/** Same pattern as `mapsEnabled()`: unset env means the feature is off, and
 * the routes answer 503 rather than crashing into the SDK. */
export function captureUploadsEnabled(): boolean {
  return bucketName() !== null
}

let cachedBucket: Bucket | null = null

async function resolveBucket(): Promise<Bucket> {
  if (cachedBucket) return cachedBucket
  const name = bucketName()
  if (!name) {
    // Callers check `captureUploadsEnabled()` first; this is the backstop.
    throw new Error('CAPTURE_BUNDLE_BUCKET is not configured')
  }
  const { Storage }: StorageModule = await import('@google-cloud/storage')
  cachedBucket = new Storage().bucket(name)
  return cachedBucket
}

/**
 * `captures/<orgId>/<sessionId>/<seq>-<kind>.bin`, per the contract doc.
 * Org first, so org isolation in the bucket is a prefix, the same way it is a
 * WHERE clause in the ledger.
 */
export function objectPathFor(orgId: string, sessionId: string, seq: number, kind: ChunkKind): string {
  return `captures/${orgId}/${sessionId}/${seq}-${kind}.bin`
}

/**
 * Opens a resumable upload session for one chunk and returns its URI.
 *
 * The declared sha256 rides along as object metadata as well as living in
 * the ledger, so the reconstruction worker can verify content with nothing
 * but the object in hand.
 */
export async function initiateResumableUpload(args: {
  path: string
  sha256: string
  /** The Origin the phone will PUT from, when it sends one. */
  origin?: string
}): Promise<string> {
  const bucket = await resolveBucket()
  const options: {
    metadata: { contentType: string; metadata: { sha256: string } }
    origin?: string
  } = {
    metadata: {
      contentType: 'application/octet-stream',
      metadata: { sha256: args.sha256 },
    },
  }
  if (args.origin !== undefined) options.origin = args.origin
  const [uri] = await bucket.file(args.path).createResumableUpload(options)
  return uri
}

export type VerifyOutcome =
  | { ok: true; bytes: number; crc32c: string | null; md5: string | null }
  | { ok: false; reason: 'missing' | 'size-mismatch'; bytes: number | null }

/**
 * Stats the uploaded object and checks it is exactly the declared size.
 *
 * Existence plus size is what the ack asserts; see the header comment for why
 * content verification is deferred to the reconstruction worker. The object's
 * crc32c/md5 are returned so the ledger's caller could persist them, and so a
 * future worker can skip a download when GCS's own checksum already fails.
 */
export async function verifyObject(path: string, declaredBytes: number): Promise<VerifyOutcome> {
  const bucket = await resolveBucket()
  let metadata: { size?: string | number; crc32c?: string; md5Hash?: string }
  try {
    const [meta] = await bucket.file(path).getMetadata()
    metadata = meta
  } catch (cause) {
    if (isMissing(cause)) return { ok: false, reason: 'missing', bytes: null }
    throw cause
  }
  const bytes = Number(metadata.size ?? Number.NaN)
  if (!Number.isFinite(bytes)) return { ok: false, reason: 'missing', bytes: null }
  if (bytes !== declaredBytes) return { ok: false, reason: 'size-mismatch', bytes }
  return { ok: true, bytes, crc32c: metadata.crc32c ?? null, md5: metadata.md5Hash ?? null }
}

/** A 404 from the API, whatever shape the SDK wrapped it in. */
function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: number }).code === 404
}

/** For tests only: drops the cached bucket so env changes take effect. */
export function resetGcsForTests(): void {
  cachedBucket = null
}
