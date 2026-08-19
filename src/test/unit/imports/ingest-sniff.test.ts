// Magic-byte sniffing. Pure functions, no DB, no blob store.

import { describe, expect, it } from 'vitest'

import { isMislabeled, sniffMimeType } from '@/modules/imports/ingest/sniff'

import { jpegWithGps, onePagePdf, solidJpeg, solidPng } from './image-fixtures'

describe('sniffMimeType', () => {
  it('reads real PNG, JPEG, and PDF bytes', async () => {
    expect(sniffMimeType(await solidPng())).toBe('image/png')
    expect(sniffMimeType(await solidJpeg())).toBe('image/jpeg')
    expect(sniffMimeType(await jpegWithGps())).toBe('image/jpeg')
    expect(sniffMimeType(onePagePdf())).toBe('application/pdf')
  })

  it('reads a WebP RIFF container', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x20, 0x00, 0x00, 0x00]),
      Buffer.from('WEBPVP8 ', 'latin1'),
    ])
    expect(sniffMimeType(webp)).toBe('image/webp')
  })

  it('reads HEIC and HEIF brands, and refuses the neighbouring ones', () => {
    const ftyp = (brand: string): Buffer =>
      Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp', 'latin1'),
        Buffer.from(brand, 'latin1'),
      ])

    expect(sniffMimeType(ftyp('heic'))).toBe('image/heic')
    expect(sniffMimeType(ftyp('hevc'))).toBe('image/heic')
    expect(sniffMimeType(ftyp('mif1'))).toBe('image/heif')
    // AVIF and MP4 share the container but are not accepted types.
    expect(sniffMimeType(ftyp('avif'))).toBeNull()
    expect(sniffMimeType(ftyp('mp42'))).toBeNull()
    expect(sniffMimeType(ftyp('isom'))).toBeNull()
  })

  it('rejects a file whose extension and declared type lie about its bytes', async () => {
    // A Windows executable that a client will happily call `backyard.png`.
    const executable = Buffer.concat([
      Buffer.from('MZ', 'latin1'),
      Buffer.alloc(126, 0x00),
      Buffer.from('PE\0\0', 'latin1'),
    ])
    expect(sniffMimeType(executable)).toBeNull()

    // And the inverse: a genuine PNG declared as a PDF is still a PNG.
    expect(sniffMimeType(await solidPng())).toBe('image/png')
  })

  it('rejects a truncated header rather than guessing', () => {
    expect(sniffMimeType(Buffer.from([0x89, 0x50]))).toBeNull()
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(sniffMimeType(Buffer.from('RIFF', 'latin1'))).toBeNull()
    expect(sniffMimeType(Buffer.from('%PD', 'latin1'))).toBeNull()
    expect(sniffMimeType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp', 'latin1')]))).toBeNull()
  })

  it('rejects a zero-byte buffer', () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull()
  })

  it('rejects arbitrary text and random bytes', () => {
    expect(sniffMimeType(Buffer.from('not an image at all, just prose', 'utf8'))).toBeNull()
    expect(sniffMimeType(Buffer.alloc(64, 0x00))).toBeNull()
  })
})

describe('isMislabeled', () => {
  it('flags a declared type that disagrees with the bytes', () => {
    expect(isMislabeled('image/png', 'image/jpeg')).toBe(true)
    expect(isMislabeled('application/pdf', 'image/png')).toBe(true)
  })

  it('tolerates a missing declaration and the image/jpg misspelling', () => {
    expect(isMislabeled(null, 'image/png')).toBe(false)
    expect(isMislabeled('', 'image/png')).toBe(false)
    expect(isMislabeled('image/jpg', 'image/jpeg')).toBe(false)
    expect(isMislabeled('image/png; charset=binary', 'image/png')).toBe(false)
  })
})
