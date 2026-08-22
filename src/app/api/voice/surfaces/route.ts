import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { initCommands } from '@/modules/commands/init'
import type { SerializedScope } from '@/modules/voice/bridge'
import { voiceEnabled } from '@/modules/voice/config'
import { scopeFor, VOICE_SCREENS, type VoiceScreen } from '@/modules/voice/scope'

// The tool surfaces, computed once per screen and handed to the client.
//
// The browser cannot build these itself: `initCommands()` pulls in every command
// module, and several reach for Prisma inside `execute`, so importing the
// registry client-side would put a database client in the browser bundle. The
// server already has it, and what comes back is just names and JSON schemas.

initCommands()

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  if (!voiceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Voice is not enabled' }, { status: 503 })
  }

  const surfaces = {} as Record<VoiceScreen, SerializedScope>
  let refused = 0

  for (const screen of VOICE_SCREENS) {
    const scope = scopeFor(screen)
    surfaces[screen] = { categories: scope.categories, surface: scope.surface }
    refused += scope.surface.refused.length
  }

  // Refusals are the converter declining to describe a command rather than
  // mangling it. Logged rather than hidden, because a command missing from the
  // spoken surface is otherwise invisible until a user asks for it.
  if (refused > 0) console.warn(`[voice] ${refused} command(s) have no spoken form`)

  return NextResponse.json(
    { ok: true, surfaces },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
