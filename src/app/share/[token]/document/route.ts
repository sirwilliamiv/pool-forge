// The customer's own download of the file they were sent.
//
// Public, like the page it sits under: the unguessable token is the capability
// and there is no session behind the request. Nothing about the response is
// derived from anything the caller sent except the token, which is looked up on
// a unique column, and the org is taken off the project that token resolved to.
//
// Served as an attachment rather than inline. The bytes are same-origin HTML;
// they are ours, they are verified against the hash the row recorded, and the
// parser refuses a `<script`, but a download costs nothing and removes the
// question entirely.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { documentFilename } from '@/modules/exports/document/kinds'
import { readStoredExport, storedProposalForShare } from '@/modules/exports/document/read'
import { DOCUMENT_MIME_TYPE } from '@/modules/exports/document/html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const tokenSchema = z.string().min(1).max(256)

function notFound(): NextResponse {
  const res = NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const params = await context.params
  const parsed = tokenSchema.safeParse(params.token)
  if (!parsed.success) return notFound()

  const project = await db.project.findUnique({
    where: { shareToken: parsed.data },
    select: { id: true, orgId: true, proposalAcceptedAt: true },
  })
  if (!project) return notFound()

  const ref = await storedProposalForShare(project)
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
      // A customer's proposal. No proxy, no disk, no history.
      'Cache-Control': 'private, no-store',
      ETag: `"${ref.contentHash}"`,
    },
  })
}
