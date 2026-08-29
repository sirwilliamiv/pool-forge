// HEVC-coded HEIC decoding.
//
// The prebuilt libvips that ships with sharp includes AV1 but not HEVC, so an
// iPhone HEIC opens far enough to report its dimensions and then fails on the
// pixels with "Support for this compression format has not been built in".
// `sharp().metadata()` succeeding therefore proves nothing about decodability.
//
// This matters more than a normal format gap: a photograph of a sketch, taken
// on a phone, is the single most common thing a customer will send. Telling
// them to export it as a JPEG first is a real drop-off point in the one flow
// the whole feature exists to serve.
//
// libheif-js is libheif plus libde265 compiled to wasm, so it decodes HEVC
// everywhere the app runs, including a Linux container, with no native build
// step and no platform-specific binary.

import type sharp from 'sharp'

/** Guard against a decompression bomb: 8000 x 8000 x 4 bytes is 256MB. */
const MAX_HEIC_PIXELS = 64_000_000

interface HeifImage {
  get_width(): number
  get_height(): number
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: unknown) => void,
  ): void
}

interface HeifDecoderLike {
  decode(bytes: Uint8Array): HeifImage[]
}

/**
 * Decoded pixels in the shape sharp's `raw` input expects.
 *
 * Returned rather than piped straight into sharp so the caller keeps control of
 * the encode step and this module stays free of format policy.
 */
export interface DecodedHeic {
  data: Buffer
  width: number
  height: number
  channels: 4
}

/**
 * Decode the primary image of a HEIC/HEIF buffer to raw RGBA.
 *
 * Throws on anything unusable so the caller can map it to an `IngestRejection`.
 * The wasm module is imported lazily: it is several megabytes and must not load
 * for the JPEG and PNG paths that make up most uploads.
 */
export async function decodeHeic(bytes: Buffer): Promise<DecodedHeic> {
  const mod = await import('libheif-js')
  const lib = (mod.default ?? mod) as unknown as { HeifDecoder: new () => HeifDecoderLike }

  const decoder = new lib.HeifDecoder()
  const images = decoder.decode(bytes)
  const image = images[0]
  if (!image) throw new Error('HEIC container holds no decodable image')

  const width = image.get_width()
  const height = image.get_height()
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('HEIC image reports no usable dimensions')
  }
  if (width * height > MAX_HEIC_PIXELS) {
    throw new Error(`HEIC image is too large to decode: ${width}x${height}`)
  }

  const rgba = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) => {
    image.display({ data: rgba, width, height }, result => {
      if (result) resolve()
      else reject(new Error('HEIC pixel decode returned no data'))
    })
  })

  return { data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height, channels: 4 }
}

/** True for the two MIME types that need the wasm path. */
export function needsHeicDecode(sniffed: string): boolean {
  return sniffed === 'image/heic' || sniffed === 'image/heif'
}

/**
 * HEIC carries EXIF orientation the same way JPEG does, but the decoded RGBA
 * has already been laid out by libheif, so sharp must not apply it a second
 * time. Callers use this instead of `.rotate()` on the HEIC path.
 */
export function heicPipelineNote(): string {
  return 'orientation already applied by libheif'
}

export type SharpRawInput = Parameters<typeof sharp>[1]
