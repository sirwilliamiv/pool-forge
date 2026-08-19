// Decode, EXIF strip, and derivative generation.
//
// Library choice: `sharp`. It was already present as a transitive dependency of
// Next.js, it is the only mainstream Node image library that decodes, resizes,
// and re-encodes without shelling out, and its default output pipeline copies
// no metadata, which is exactly the property this module needs.
//
// EXIF stripping is not a post-processing step. `prepareImage` never returns
// the caller's bytes for a raster image: it returns a re-encode, so the GPS
// coordinates of a customer's home cannot reach the blob store, the vision
// model, or a downstream export. `.rotate()` with no argument bakes the EXIF
// orientation into the pixels first, so discarding the tag does not leave a
// portrait photo lying on its side.

import sharp from 'sharp'

import { logIngestFailure } from './errors'
import { rasterizeFirstPage } from './pdf'
import { IngestRejection, VISION_MAX_EDGE_PX, type AllowedMimeType } from './types'

/** Long-edge target for the gallery thumbnail. */
export const THUMBNAIL_MAX_EDGE_PX = 320

const JPEG_QUALITY = 92
const THUMBNAIL_QUALITY = 80

export interface PreparedBlob {
  data: Buffer
  mimeType: string
}

export interface PreparedImage {
  /** Stored as the original. EXIF-free re-encode for rasters; the PDF itself for PDFs. */
  original: PreparedBlob
  /** Real decoded pixel dimensions, after orientation is applied. Never claimed metadata. */
  widthPx: number
  heightPx: number
  /** Downscaled copy for vision model calls. */
  vision: PreparedBlob
  thumbnail: PreparedBlob
}

type CanonicalFormat = 'png' | 'jpeg' | 'webp'

/**
 * The format the EXIF-free decoded copy is written in. Line art (PNG, WebP,
 * rasterized PDFs) stays lossless because a graph-paper sketch's thin strokes
 * and handwritten `1 sq = 1 ft` note are exactly what the model has to read.
 * Camera formats are already lossy, so they stay JPEG rather than ballooning.
 */
function canonicalFormatFor(sniffed: AllowedMimeType): CanonicalFormat {
  switch (sniffed) {
    case 'image/jpeg':
    case 'image/heic':
    case 'image/heif':
      return 'jpeg'
    case 'image/webp':
      return 'webp'
    case 'image/png':
    case 'application/pdf':
      return 'png'
  }
}

function mimeForFormat(format: CanonicalFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : `image/${format}`
}

function encode(pipeline: sharp.Sharp, format: CanonicalFormat): sharp.Sharp {
  switch (format) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 })
    case 'jpeg':
      return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    case 'webp':
      return pipeline.webp({ quality: JPEG_QUALITY })
  }
}

/**
 * Opens the buffer as a decoding pipeline. `limitInputPixels` keeps sharp's
 * default decompression-bomb ceiling; `failOn: 'error'` tolerates the warnings
 * real phone cameras emit while still refusing genuinely broken files.
 */
function open(bytes: Buffer): sharp.Sharp {
  return sharp(bytes, { failOn: 'error' })
}

import { decodeHeic, needsHeicDecode } from './heic'

function decodeFailure(sniffed: AllowedMimeType, err: unknown): IngestRejection {
  const ref = logIngestFailure(`decode ${sniffed}`, err)
  if (sniffed === 'image/heic' || sniffed === 'image/heif') {
    // HEVC now decodes through the wasm path, so reaching here means the file
    // itself is unreadable rather than the format being unsupported.
    return new IngestRejection(
      'CORRUPT',
      `That HEIC image could not be read (ref ${ref}).`,
    )
  }
  return new IngestRejection('CORRUPT', `That image could not be read (ref ${ref}).`)
}

/**
 * Decodes, strips metadata, and produces the three blobs ingest stores.
 *
 * For `application/pdf` the stored original is the untouched PDF and every
 * derivative comes from a page-1 raster, per the design spec.
 */
export async function prepareImage(
  bytes: Buffer,
  sniffed: AllowedMimeType,
): Promise<PreparedImage> {
  const format = canonicalFormatFor(sniffed)
  let canonical: Buffer
  let widthPx: number
  let heightPx: number

  if (sniffed === 'application/pdf') {
    const page = await rasterizeFirstPage(bytes)
    canonical = await encode(
      sharp(page.data, { raw: { width: page.width, height: page.height, channels: 4 } }),
      format,
    ).toBuffer()
    widthPx = page.width
    heightPx = page.height
  } else if (needsHeicDecode(sniffed)) {
    // sharp's libvips has no HEVC, so the pixels come from the wasm decoder.
    // libheif has already applied orientation, hence no `.rotate()` here, and
    // raw RGBA carries no metadata at all, so the strip is inherent.
    try {
      const decoded = await decodeHeic(bytes)
      const out = await encode(
        sharp(decoded.data, {
          raw: { width: decoded.width, height: decoded.height, channels: decoded.channels },
        }),
        format,
      ).toBuffer({ resolveWithObject: true })
      canonical = out.data
      widthPx = out.info.width
      heightPx = out.info.height
    } catch (err) {
      throw decodeFailure(sniffed, err)
    }
  } else {
    try {
      // `.rotate()` applies the EXIF orientation; the re-encode then drops every
      // tag, GPS included, because sharp copies no metadata unless asked to.
      const out = await encode(open(bytes).rotate(), format).toBuffer({ resolveWithObject: true })
      canonical = out.data
      widthPx = out.info.width
      heightPx = out.info.height
    } catch (err) {
      throw decodeFailure(sniffed, err)
    }
  }

  if (widthPx < 1 || heightPx < 1) {
    throw new IngestRejection('CORRUPT', 'That image has no usable pixel dimensions.')
  }

  const vision = await encode(
    open(canonical).resize({
      width: VISION_MAX_EDGE_PX,
      height: VISION_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    }),
    format,
  ).toBuffer()

  const thumbnail = await open(canonical)
    .resize({
      width: THUMBNAIL_MAX_EDGE_PX,
      height: THUMBNAIL_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer()

  const original: PreparedBlob =
    sniffed === 'application/pdf'
      ? { data: bytes, mimeType: 'application/pdf' }
      : { data: canonical, mimeType: mimeForFormat(format) }

  return {
    original,
    widthPx,
    heightPx,
    vision: { data: vision, mimeType: mimeForFormat(format) },
    thumbnail: { data: thumbnail, mimeType: 'image/webp' },
  }
}
