// Two independent ways this screen showed "Image 1 could not be loaded", both
// invisible to the tracks that caused them.
//
// 1. The review wizard built `/api/imports/images/{id}` while the route was
//    mounted at `/api/imports/blob/[key]`. Nothing tied the two spellings
//    together, so each side was self-consistent and wrong.
// 2. Even at the right path, `?v=original` serves a HEIC original as
//    `image/heic`, which no browser renders. An iPhone upload, the most common
//    input this feature has, still showed a broken image.

import { describe, expect, it } from 'vitest'

import { IMPORT_BLOB_PATH, sourceImageUrl } from '@/modules/imports/ingest/types'
import { sourceImageUrl as clientSourceImageUrl } from '@/components/imports/source-image'

describe('source image URLs', () => {
  it('points at the path the route is actually mounted at', () => {
    expect(IMPORT_BLOB_PATH).toBe('/api/imports/blob')
    expect(sourceImageUrl('abc123')).toContain('/api/imports/blob/abc123')
  })

  it('is the same function on the client as on the server', () => {
    // Re-exported rather than re-declared, so the two cannot drift again.
    expect(clientSourceImageUrl).toBe(sourceImageUrl)
  })

  it('defaults to a browser-renderable variant, not the raw original', () => {
    // A HEIC original is served as image/heic. Defaulting to it renders nothing.
    expect(sourceImageUrl('abc123')).toContain('v=vision')
    expect(sourceImageUrl('abc123')).not.toContain('v=original')
  })

  it('still allows an explicit variant', () => {
    expect(sourceImageUrl('abc123', 'thumbnail')).toContain('v=thumbnail')
    expect(sourceImageUrl('abc123', 'original')).toContain('v=original')
  })

  it('encodes the id rather than interpolating it raw', () => {
    expect(sourceImageUrl('a/b?c')).toContain(encodeURIComponent('a/b?c'))
  })
})
