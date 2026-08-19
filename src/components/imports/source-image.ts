// The two ingest endpoints this screen consumes. Track I1 owns both; nothing
// here implements them. They are named in one place so that when I1 lands the
// review wizard needs no edit, and so the failure copy shown until then names
// the same thing the URL points at.

/** Org-scoped authenticated blob read. Bytes never travel in a JSON column. */
export function sourceImageUrl(sourceImageId: string): string {
  return `/api/imports/images/${encodeURIComponent(sourceImageId)}`
}

/** Multipart upload. Sniffs magic bytes, strips EXIF, dedupes on sha256. */
export const IMPORT_UPLOAD_URL = '/api/imports/upload'

export const INGEST_UNAVAILABLE_MESSAGE =
  'Image ingest is not available on this deployment yet, so uploads and previews cannot be served.'
