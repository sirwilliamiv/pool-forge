// The builder's read of a stored document.
//
// Org-scoped through the relation, not through the id: an export id is an
// address, never a capability, so a member of one organisation replaying
// another's id gets the same 404 as an id that does not exist. Same rule as the
// blob route the image pipeline serves.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrgId, getSession } from '@/modules/auth/session'
import { DOCUMENT_MIME_TYPE } from '@/modules/exports/document/html'
import { documentFilename } from '@/modules/exports/document/kinds'
import { readStoredExport, storedExportById } from '@/modules/exports/document/read'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const idSchema = z.string().min(1).max(64)

function notFound(): NextResponse {
  const res = NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    const res = NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  const params = await context.params
  const parsed = idSchema.safeParse(params.id)
  if (!parsed.success) return notFound()

  const ref = await storedExportById(parsed.data, orgId)
  if (!ref) return notFound()

  const read = await readStoredExport(ref)
  if (!read.ok) return notFound()

  const filename = documentFilename({
    kind: ref.kind,
    jobNumber: ref.jobNumber,
    exportId: ref.id,
    generatedAt: ref.generatedAt,
  })

  const body = new Uint8Array(read.bytes)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': DOCUMENT_MIME_TYPE,
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      ETag: `"${ref.contentHash}"`,
    },
  })
}
