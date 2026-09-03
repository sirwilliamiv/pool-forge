// Proxied Places Autocomplete (New).
//
// The browser never talks to Google: the key stays on the server, and every
// request is authenticated first, so the proxy cannot be farmed for free
// autocomplete by anyone who finds the URL. Without a configured key the route
// answers 503 with an empty list, which the address field treats as "the
// feature is off" rather than an error.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrgId, getSession } from '@/modules/auth/session'
import { autocompleteAddress, mapsEnabled } from '@/modules/site/geo/google'
import { checkMapsProxyBudget } from '@/modules/site/geo/proxy-rate-limit'
import type { AddressSuggestion } from '@/modules/site/geo/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: z.string().min(3).max(200),
  // A billing session token the client mints per address-entry session;
  // uuid-ish, and never anything Google would interpret.
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
})

export async function GET(req: Request): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    session: url.searchParams.get('session') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid query' }, { status: 400 })
  }

  if (!mapsEnabled()) {
    return NextResponse.json({ suggestions: [] satisfies AddressSuggestion[] }, { status: 503 })
  }

  // Billed per call: bound one caller before reaching Google.
  const budget = await checkMapsProxyBudget(req.headers)
  if (!budget.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many address lookups. Try again shortly.', suggestions: [] },
      { status: 429, headers: { 'retry-after': String(budget.retryAfterSeconds) } },
    )
  }

  const suggestions = await autocompleteAddress(parsed.data.q, parsed.data.session)
  return NextResponse.json({ suggestions })
}
