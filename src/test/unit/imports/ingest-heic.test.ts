// @vitest-environment node
//
// A photograph of a sketch, taken on a phone, is the single most common thing a
// customer will send. On iOS that is an HEVC-coded HEIC, and sharp's bundled
// libvips has no HEVC, so this path is what keeps the primary input working.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { decodeHeic, needsHeicDecode } from '@/modules/imports/ingest/heic'
import { prepareImage } from '@/modules/imports/ingest/pipeline'
import { sniffMimeType } from '@/modules/imports/ingest/sniff'

const FIXTURE = join(process.cwd(), 'src/test/fixtures/images/tiny.heic')
const bytes = readFileSync(FIXTURE)

describe('HEIC ingest', () => {
  it('sniffs an HEVC-coded HEIC by its brand, not its extension', () => {
    expect(sniffMimeType(bytes)).toBe('image/heic')
    expect(needsHeicDecode('image/heic')).toBe(true)
    expect(needsHeicDecode('image/heif')).toBe(true)
    expect(needsHeicDecode('image/jpeg')).toBe(false)
  })

  it('documents why the wasm path exists: sharp reads the header but not the pixels', async () => {
    // Metadata succeeds, which is the trap. Anything that checks decodability
    // by calling `metadata()` concludes the file is fine and then fails later.
    const meta = await sharp(bytes).metadata()
    expect(meta.format).toBe('heif')
    expect(meta.width).toBeGreaterThan(0)

    await expect(sharp(bytes).jpeg().toBuffer()).rejects.toThrow()
  })

  it('decodes to raw RGBA through libheif', async () => {
    const decoded = await decodeHeic(bytes)
    expect(decoded.width).toBeGreaterThan(0)
    expect(decoded.height).toBeGreaterThan(0)
    expect(decoded.channels).toBe(4)
    expect(decoded.data.length).toBe(decoded.width * decoded.height * 4)
  })

  it('prepares all three blobs, with no metadata on any of them', async () => {
    const prepared = await prepareImage(bytes, 'image/heic')

    expect(prepared.widthPx).toBeGreaterThan(0)
    expect(prepared.heightPx).toBeGreaterThan(0)

    for (const [name, blob] of [
      ['original', prepared.original],
      ['vision', prepared.vision],
      ['thumbnail', prepared.thumbnail],
    ] as const) {
      const meta = await sharp(blob.data).metadata()
      expect(meta.width, `${name} must decode`).toBeGreaterThan(0)
      // Raw RGBA carries no tags at all, so the strip is inherent to this path
      // rather than something a later step has to remember to do.
      expect(meta.exif, `${name} must carry no EXIF`).toBeUndefined()
    }
  })

  it('rejects a truncated HEIC rather than producing a blank image', async () => {
    const truncated = bytes.subarray(0, Math.floor(bytes.length / 3))
    await expect(prepareImage(truncated, 'image/heic')).rejects.toMatchObject({
      name: 'IngestRejection',
    })
  })
})
