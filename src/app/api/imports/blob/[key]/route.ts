// Authenticated, org-scoped blob reads.
//
// A storage key is an address, never a capability. Every request resolves a
// `SourceImage` row filtered by the session's org before a single byte is read,
// so a user of org A replaying or guessing org B's key gets the same 404 as a
// key that does not exist. Nothing here trusts the key itself.
//
// `[key]` accepts either form:
//
//   - a `SourceImage` id, with `?v=original|vision|thumbnail`
//   - a blob storage key (URL-encoded, `ab%2Fcd%2F<sha256>.png`), which must be
//     the `storageKey` of a row in this org and always serves the original
//
// The vision copy and the thumbnail have no column of their own, so they are
// re-derived from the stored original. Content addressing makes that exact:
// the same original always produces the same derivative key, and writing it
// again is a no-op. See `modules/imports/ingest/variants.ts`.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { getOrgId, getSession } from '@/modules/auth/session'
import { IngestRejection } from '@/modules/imports/ingest/types'
import { IMAGE_VARIANTS, resolveVariant, type ImageVariant } from '@/modules/imports/ingest/variants'
import { BlobNotFoundError, InvalidStorageKeyError, isStorageKey } from '@/modules/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Thumbnails are small, immutable, and re-requested constantly by a gallery. */
const THUMBNAIL_MAX_AGE_SECONDS = 3600

const keySchema = z.string().min(1).max(256)
const variantSchema = z.enum(IMAGE_VARIANTS).default('original')

function notFound(): NextResponse {
  const res = NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export async function GET(
  req: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    const res = NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  const params = await context.params
  const parsedKey = keySchema.safeParse(params.key)
  if (!parsedKey.success) return notFound()
  const key = parsedKey.data

  const parsedVariant = variantSchema.safeParse(
    new URL(req.url).searchParams.get('v') ?? undefined,
  )
  if (!parsedVariant.success) return notFound()
  const variant: ImageVariant = parsedVariant.data

  // Ownership always comes from the row, never from the key.
  const image = isStorageKey(key)
    ? await db.sourceImage.findFirst({
        where: { orgId, storageKey: key },
        select: { id: true, storageKey: true, mimeType: true },
      })
    : await db.sourceImage.findFirst({
        where: { orgId, id: key },
        select: { id: true, storageKey: true, mimeType: true },
      })

  if (!image) return notFound()

  // Addressing by raw storage key can only mean the original: a derivative key
  // is not in any row, so honouring `?v=` there would be trusting the key.
  const effective: ImageVariant = isStorageKey(key) ? 'original' : variant

  let resolved
  try {
    resolved = await resolveVariant(image.storageKey, image.mimeType, effective)
  } catch (err) {
    if (
      err instanceof BlobNotFoundError ||
      err instanceof InvalidStorageKeyError ||
      err instanceof IngestRejection
    ) {
      return notFound()
    }
    throw err
  }

  const body = new Uint8Array(resolved.data)
  const headers = new Headers({
    'Content-Type': resolved.mimeType,
    'Content-Length': String(body.byteLength),
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  })

  if (effective === 'thumbnail') {
    // The key is a content hash, so it is a strong ETag by construction.
    const etag = `"${resolved.storageKey}"`
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': `private, max-age=${THUMBNAIL_MAX_AGE_SECONDS}, must-revalidate`,
        },
      })
    }
    headers.set('ETag', etag)
    headers.set(
      'Cache-Control',
      `private, max-age=${THUMBNAIL_MAX_AGE_SECONDS}, must-revalidate`,
    )
  } else {
    // Originals are the customer's photograph. No proxy, no disk, no history.
    headers.set('Cache-Control', 'private, no-store')
  }

  return new Response(body, { status: 200, headers })
}
