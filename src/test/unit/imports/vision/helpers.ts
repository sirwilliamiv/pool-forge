import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VisionImage } from '@/modules/imports/vision'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = resolve(here, '../../../fixtures/vision')

/** Read a recorded model response exactly as it was written, bytes and all. */
export function fixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, `${name}.txt`), 'utf8')
}

export function testImage(overrides: Partial<VisionImage> = {}): VisionImage {
  return {
    sourceImageId: overrides.sourceImageId ?? 'img_a',
    base64: overrides.base64 ?? 'aGVsbG8=',
    mimeType: overrides.mimeType ?? 'image/jpeg',
    widthPx: overrides.widthPx ?? 1568,
    heightPx: overrides.heightPx ?? 1176,
  }
}
