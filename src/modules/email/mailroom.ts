// Pool Forge's door to Mailroom, the shared marketing email service.
//
// Off unless both MAILROOM_URL and MAILROOM_API_KEY are set, so local and test
// runs never reach the network. Failures are captured and swallowed: a
// marketing sync must never change the outcome of the request that caused it.

import { captureError } from '@/modules/monitoring'

import { Mailroom, type ContactUpsert, type EventTrack } from './mailroom-client'

export const MAILROOM_LISTS = { WAITLIST: 'waitlist', CUSTOMERS: 'customers' } as const
export const MAILROOM_EVENTS = { WAITLIST_JOINED: 'waitlist_joined', SIGNED_UP: 'signed_up' } as const

let client: Mailroom | null | undefined

export function mailroom(): Mailroom | null {
  if (client !== undefined) return client
  const baseUrl = process.env.MAILROOM_URL?.trim()
  const apiKey = process.env.MAILROOM_API_KEY?.trim()
  client = baseUrl && apiKey ? new Mailroom({ baseUrl, apiKey }) : null
  return client
}

/** Tests only. */
export function resetMailroom(): void {
  client = undefined
}

export async function syncContact(contact: ContactUpsert, event?: EventTrack): Promise<void> {
  const mail = mailroom()
  if (!mail) return
  try {
    await mail.contacts.upsert(contact)
    if (event) await mail.events.track(event)
  } catch (err) {
    captureError({ error: err, code: 'mailroom.sync_failed', origin: 'server' })
  }
}
