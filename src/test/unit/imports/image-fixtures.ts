// Fixture builders for the ingest tests.
//
// Everything here is generated rather than committed as a binary, so the GPS
// tags the EXIF test asserts on are visible in the source that produced them.

import sharp from 'sharp'

export const EXIF_SENTINEL = 'POOLFORGE-EXIF-SENTINEL'

export interface SolidImageOptions {
  width?: number
  height?: number
  /** Varying this produces byte-distinct images, which dedupe tests need. */
  seed?: number
}

function background(seed: number): { r: number; g: number; b: number } {
  return { r: (seed * 37) % 256, g: (seed * 91) % 256, b: (seed * 143) % 256 }
}

export async function solidPng(options: SolidImageOptions = {}): Promise<Buffer> {
  const width = options.width ?? 64
  const height = options.height ?? 48
  return sharp({
    create: { width, height, channels: 3, background: background(options.seed ?? 1) },
  })
    .png()
    .toBuffer()
}

export async function solidJpeg(options: SolidImageOptions = {}): Promise<Buffer> {
  const width = options.width ?? 64
  const height = options.height ?? 48
  return sharp({
    create: { width, height, channels: 3, background: background(options.seed ?? 1) },
  })
    .jpeg()
    .toBuffer()
}

/**
 * A JPEG carrying GPS coordinates, the way a phone photograph of a customer's
 * backyard does. `IFD3` is the GPSInfo directory in sharp's exif writer.
 */
export async function jpegWithGps(options: SolidImageOptions = {}): Promise<Buffer> {
  const base = await solidJpeg(options)
  return sharp(base)
    .withExif({
      IFD0: { Copyright: EXIF_SENTINEL },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '37/1 46/1 2988/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '122/1 25/1 600/100',
      },
    })
    .jpeg()
    .toBuffer()
}

/** Resolves the GPSInfo IFD pointer (tag 0x8825) out of a raw EXIF block. */
export function gpsIfdPointer(exif: Buffer | undefined): number | null {
  if (!exif || exif.length < 16) return null
  const tiff = exif.subarray(6)
  const littleEndian = tiff.subarray(0, 2).toString('latin1') === 'II'
  const u16 = (offset: number): number =>
    littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset)
  const u32 = (offset: number): number =>
    littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset)

  const ifd0 = u32(4)
  const entries = u16(ifd0)
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd0 + 2 + i * 12
    if (u16(entry) === 0x8825) return u32(entry + 8)
  }
  return null
}

/** A minimal, structurally valid one-page PDF with a real xref table. */
export function onePagePdf(label = 'Site Plan'): Buffer {
  const content = `BT /F1 18 Tf 24 48 Td (${label}) Tj ET\n`
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 150]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>stream\n${content}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ]

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`

  return Buffer.from(out, 'latin1')
}
