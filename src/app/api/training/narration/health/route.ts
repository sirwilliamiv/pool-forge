import { NextResponse } from 'next/server'

import { probeNarration } from '@/modules/editor/training/narration'

// Is Marco's real voice actually working in this environment?
//
// A token-gated probe so it can be curled from outside without a browser
// session (the reason the main route's success could not be verified after a
// deploy). It runs one synthesis and reports ok / voice / bytes, or a short
// scrubbed reason. Returns 404 unless a token is configured, so it is inert
// wherever the secret is absent.

export async function GET(request: Request): Promise<Response> {
  // Trimmed: secrets from Secret Manager can carry a trailing newline.
  const expected = process.env['TRAINING_HEALTH_TOKEN']?.trim()
  if (!expected) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const auth = request.headers.get('authorization')?.trim() ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth
  if (token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const probe = await probeNarration()
  return NextResponse.json(probe, { status: probe.ok ? 200 : 503 })
}
