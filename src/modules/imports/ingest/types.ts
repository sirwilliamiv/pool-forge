// The ingest seam. Track I1 implements `ingestImage`; Track I5's public intake
// funnel and the builder-side editor upload both call it, so byte handling,
// validation, EXIF stripping, and dedupe exist in exactly one place.
//
// Anything that accepts bytes from outside the process goes through here.
// A second upload path that skips this is a security bug, not a shortcut.

/** Hard caps. The public intake route may lower these but never raise them. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_IMAGES_PER_SESSION = 8

/**
 * Accepted types. Enforced by magic-byte sniffing of the actual buffer, never
 * by trusting a client-declared Content-Type or a file extension.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

/** Long-edge pixel target for the copy sent to the vision model. */
export const VISION_MAX_EDGE_PX = 1568

/**
 * Multipart field name for uploaded files, shared by the builder upload route
 * and the client that posts to it.
 *
 * A constant rather than a literal on each side because they were written by
 * different tracks and drifted: the client appended `files` while the route
 * read `file`, so every builder-side upload 400d with "No file was attached"
 * while both sides' own tests passed.
 */
export const UPLOAD_FILE_FIELD = 'files'

export type IngestOrigin = 'BUILDER' | 'CUSTOMER_INTAKE'

export interface IngestInput {
  bytes: Buffer
  /** What the client claimed. Advisory only; the sniffed type wins. */
  declaredMimeType: string | null
  orgId: string
  projectId: string | null
  origin: IngestOrigin
  uploadedBy: string | null
}

export interface IngestResult {
  sourceImageId: string
  sha256: string
  /** True when an identical sha256 already existed for this org and was reused. */
  deduped: boolean
  widthPx: number
  heightPx: number
  mimeType: AllowedMimeType
  storageKey: string
  /** Downscaled copy for model calls and previews. */
  visionKey: string
  thumbnailKey: string
}

export type IngestRejectionCode =
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT'
  | 'TOO_MANY'
  | 'EMPTY'

/**
 * Thrown for input the caller supplied wrongly. Carries a code so routes can
 * map to a status without string-matching, and a message safe to show a user:
 * it never echoes a filename, a path, or an underlying library error.
 */
export class IngestRejection extends Error {
  readonly code: IngestRejectionCode

  constructor(code: IngestRejectionCode, message: string) {
    super(message)
    this.name = 'IngestRejection'
    this.code = code
  }
}
