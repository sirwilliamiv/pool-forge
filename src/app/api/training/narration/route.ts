import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { synthesizeNarration } from '@/modules/editor/training/narration'

// Marco's spoken lines for the training, in his real voice.
//
// POST a caption line, get back WAV in Gemini's "Charon" voice (cached, so the
// fixed script costs nothing after the first render). A 204 means synthesis is
// unavailable and the client should speak with a browser voice instead — never
// an error the UI has to handle, because the training must always narrate.

const bodySchema = z.object({
  // A caption line, not free-form generation: short, and only ever from the
  // fixed script. Capped so this can never be turned into an open TTS service.
  text: z.string().trim().min(1).max(400),
})

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const clip = await synthesizeNarration(parsed.data.text)
  if (!clip) return new NextResponse(null, { status: 204 })

  return new NextResponse(new Uint8Array(clip.wav), {
    status: 200,
    headers: {
      'content-type': 'audio/wav',
      // Fixed lines: let the browser reuse the clip across the run.
      'cache-control': 'private, max-age=86400',
    },
  })
}
