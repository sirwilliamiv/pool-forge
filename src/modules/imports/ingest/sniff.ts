// Magic-byte sniffing.
//
// The client-declared Content-Type and the filename extension are both attacker
// controlled and both are ignored. Only the leading bytes of the buffer decide
// what a file is: a `.png` whose bytes are a Windows executable is rejected as
// UNSUPPORTED_TYPE, never decoded, never stored.

import type { AllowedMimeType } from './types'

/** Shortest prefix that can decide any supported type (RIFF/WebP and ISO-BMFF). */
export const MIN_SNIFF_BYTES = 12

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1')

/**
 * ISO base media brands. HEVC-coded brands are `image/heic`; the generic image
 * container brands are `image/heif`. Every other brand (`avif`, `mp42`, `isom`,
 * `qt  `, ...) is deliberately absent: AVIF and video are not accepted types,
 * so they fall through to `null` rather than being smuggled in as HEIF.
 */
const HEIF_BRANDS: Record<string, AllowedMimeType> = {
  heic: 'image/heic',
  heix: 'image/heic',
  hevc: 'image/heic',
  hevx: 'image/heic',
  heim: 'image/heic',
  heis: 'image/heic',
  hevm: 'image/heic',
  hevs: 'image/heic',
  mif1: 'image/heif',
  msf1: 'image/heif',
  miaf: 'image/heif',
}

function startsWith(bytes: Buffer, signature: Buffer): boolean {
  if (bytes.length < signature.length) return false
  return bytes.subarray(0, signature.length).equals(signature)
}

function asciiAt(bytes: Buffer, start: number, end: number): string {
  if (bytes.length < end) return ''
  return bytes.subarray(start, end).toString('latin1')
}

/**
 * The real type of a buffer, or `null` when the bytes are not one of the
 * accepted types. A truncated header returns `null` rather than guessing.
 */
export function sniffMimeType(bytes: Buffer): AllowedMimeType | null {
  if (bytes.length === 0) return null

  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg'
  if (startsWith(bytes, PDF_SIGNATURE)) return 'application/pdf'

  if (bytes.length < MIN_SNIFF_BYTES) return null

  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }

  if (asciiAt(bytes, 4, 8) === 'ftyp') {
    const brand = asciiAt(bytes, 8, 12).toLowerCase()
    return HEIF_BRANDS[brand] ?? null
  }

  return null
}

/** True when the declared type disagrees with what the bytes actually are. */
export function isMislabeled(declaredMimeType: string | null, sniffed: AllowedMimeType): boolean {
  if (!declaredMimeType) return false
  const normalized = declaredMimeType.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized === '') return false
  if (normalized === sniffed) return false
  // `image/jpg` is a common misspelling of the same thing, not a mislabel.
  if (normalized === 'image/jpg' && sniffed === 'image/jpeg') return false
  return true
}
