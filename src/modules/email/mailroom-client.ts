/**
 * Mailroom client. Install from the repo:
 *   pnpm add github:sirwilliamiv/mailroom#path:packages/client
 * or copy this single file into the app.
 *
 *   const mail = new Mailroom({ apiKey: process.env.MAILROOM_API_KEY!, baseUrl: 'https://mailroom-....run.app' })
 *   await mail.contacts.upsert({ email, firstName, lists: ['waitlist'], attributes: { plan: 'beta' } })
 *   await mail.events.track({ email, name: 'signed_up' })
 *   await mail.send({ to: email, template: 'welcome', data: { firstName } })
 */

export interface MailroomOptions {
  apiKey: string
  baseUrl: string
  /** Retries for 429 and 5xx on idempotent calls. Default 3. */
  retries?: number
  fetch?: typeof fetch
}

export type Attributes = Record<string, string | number | boolean | null>

export interface ContactUpsert {
  email: string
  firstName?: string
  lastName?: string
  attributes?: Attributes
  lists?: string[]
  source?: string
  externalId?: string
}

export interface ContactView {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  attributes: Attributes
  status: 'ACTIVE' | 'PENDING_CONFIRM' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED'
  source: string | null
  externalId: string | null
  lists: string[]
  createdAt: string
  updatedAt: string
}

export interface EventTrack {
  email: string
  name: string
  properties?: Attributes
  occurredAt?: string
}

export interface TransactionalSend {
  to: string
  subject?: string
  template?: string
  html?: string
  text?: string
  data?: Record<string, unknown>
  replyTo?: string
  idempotencyKey?: string
  tags?: Record<string, string>
}

export interface SendResult {
  messageId: string
  resendId: string | null
  status: 'SENT' | 'FAILED'
}

export class MailroomError extends Error {
  readonly status: number
  readonly code: string
  readonly ref: string | undefined
  constructor(status: number, code: string, message: string, ref?: string) {
    super(message)
    this.status = status
    this.code = code
    this.ref = ref
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])

export class Mailroom {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly retries: number
  private readonly fetchImpl: typeof fetch

  constructor(opts: MailroomOptions) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.retries = opts.retries ?? 3
    this.fetchImpl = opts.fetch ?? fetch
  }

  readonly contacts = {
    upsert: (contact: ContactUpsert): Promise<{ created: number; updated: number; contacts: ContactView[] }> =>
      this.request('POST', '/v1/contacts/upsert', { contacts: [contact] }, true),
    upsertMany: (contacts: ContactUpsert[]): Promise<{ created: number; updated: number; contacts: ContactView[] }> =>
      this.request('POST', '/v1/contacts/upsert', { contacts }, true),
    get: (email: string): Promise<ContactView | null> =>
      this.request<ContactView>('GET', `/v1/contacts/${encodeURIComponent(email)}`, undefined, true).catch((e: unknown) => {
        if (e instanceof MailroomError && e.status === 404) return null
        throw e
      }),
    unsubscribe: (email: string, source = 'app'): Promise<void> =>
      this.request('POST', `/v1/contacts/${encodeURIComponent(email)}/unsubscribe`, { source }, true),
  }

  readonly events = {
    track: (event: EventTrack): Promise<{ eventId: string; contactId: string }> => this.request('POST', '/v1/events', event, false),
  }

  /** Transactional send. Pass `idempotencyKey` to make retries safe. */
  send(input: TransactionalSend): Promise<SendResult> {
    return this.request('POST', '/v1/send', input, Boolean(input.idempotencyKey))
  }

  private async request<T>(method: string, path: string, body: unknown, idempotent: boolean): Promise<T> {
    let attempt = 0
    for (;;) {
      const init: RequestInit = { method, headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' } }
      if (body !== undefined) init.body = JSON.stringify(body)
      let res: Response
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, init)
      } catch (err) {
        if (idempotent && attempt < this.retries) {
          await sleep(backoff(attempt++))
          continue
        }
        throw new MailroomError(0, 'network', err instanceof Error ? err.message : 'network error')
      }
      if (res.ok) return (await res.json()) as T
      if (idempotent && RETRYABLE.has(res.status) && attempt < this.retries) {
        await sleep(backoff(attempt++))
        continue
      }
      const parsed = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string; ref?: string } }
      throw new MailroomError(res.status, parsed.error?.code ?? 'error', parsed.error?.message ?? `HTTP ${res.status}`, parsed.error?.ref)
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(4000, 250 * 2 ** attempt) + Math.random() * 100
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
