import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { voiceEnabled } from '@/modules/voice/config'
import { mintTicket, ticketSecret, TICKET_TTL_SECONDS } from '@/modules/voice/ticket'

// A short-lived pass for the relay socket.
//
// This app already knows who the user is; the relay does not, and giving it a
// session store of its own is how the two drift until one is wrong. So the proof
// travels with the connection instead, signed here and only checked there.

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** From voice.session.begin — the budget row this socket will spend. */
  sessionId: z.string().min(1),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
})

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id
  const orgId = session?.user?.orgId
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  if (!voiceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Voice is not enabled' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }

  let token: string
  try {
    // The org and user come from the session, never from the request body: a
    // ticket is an authorisation, and letting the caller name its own org would
    // make it one they wrote themselves.
    token = mintTicket(
      {
        userId,
        orgId,
        sessionId: parsed.data.sessionId,
        ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
        ...(parsed.data.projectName ? { projectName: parsed.data.projectName } : {}),
      },
      ticketSecret(),
    )
  } catch {
    // A missing or weak secret is a deployment fault, not something to explain
    // to the user or to leak the shape of.
    console.error('[voice] ticket secret is missing or too short')
    return NextResponse.json({ ok: false, error: 'Voice is not configured' }, { status: 503 })
  }

  return NextResponse.json(
    { ok: true, ticket: token, expiresInSeconds: TICKET_TTL_SECONDS },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
