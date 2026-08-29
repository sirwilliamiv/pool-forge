// The two ingest endpoints this screen consumes, both owned by the ingest
// module. Re-exported here rather than re-declared: the previous copy spelled
// the blob path as `/api/imports/images/{id}` while the route was mounted at
// `/api/imports/blob/[key]`, so every image in the wizard failed to load.

export {
  IMPORT_BLOB_PATH,
  sourceImageUrl,
  type ImageVariantName,
} from '@/modules/imports/ingest/types'

/** Multipart upload. Sniffs magic bytes, strips EXIF, dedupes on sha256. */
export const IMPORT_UPLOAD_URL = '/api/imports/upload'

export const INGEST_UNAVAILABLE_MESSAGE =
  'Image ingest is not available on this deployment yet, so uploads and previews cannot be served.'
