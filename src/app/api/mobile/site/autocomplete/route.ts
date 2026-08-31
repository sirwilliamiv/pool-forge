// Proxied Places Autocomplete for the phone.
//
// The same proxy as `/api/site/autocomplete` with the auth swapped: the phone
// holds a `pfc_` bearer, not a cookie. The key stays on the server, every
// request is authenticated first, and without a configured key the route
// answers 503 with an empty list, which the address field treats as "the
// feature is off" rather than an error. Read-only, so no audit row: the
// audited action is the capture session the person eventually opens, not
// every keystroke on the way there.

import { z } from 'zod'

import { bearerAuth, json, unauthorized } from '@/modules/capture-bundle/http'
import { autocompleteAddress, mapsEnabled } from '@/modules/site/geo/google'
import type { AddressSuggestion } from '@/modules/site/geo/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: z.string().min(3).max(200),
  // A billing session token the app mints per address-entry session;
  // uuid-ish, and never anything Google would interpret.
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
})

export async function GET(req: Request): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    session: url.searchParams.get('session') ?? '',
  })
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid query' }, 400)
  }

  if (!mapsEnabled()) {
    return json({ suggestions: [] satisfies AddressSuggestion[] }, 503)
  }

  const suggestions = await autocompleteAddress(parsed.data.q, parsed.data.session)
  return json({ suggestions }, 200)
}
