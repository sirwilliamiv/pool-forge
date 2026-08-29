// Google Identity Platform (GCIP), spoken to over its REST API.
//
// WHY REST AND NOT `firebase-admin`
//
// Everything this product needs from an identity service is on three Identity
// Toolkit endpoints that take a browser API key: verify a password, create an
// account, send a reset email. None of them needs a service-account credential,
// so none of them needs the admin SDK, a key file, or application default
// credentials. That is worth having twice over: `firebase-admin` is a large
// dependency whose only contribution here would be a JWT signer for endpoints
// this product never calls, and ADC on a developer machine is a login somebody
// has to have done. Nothing in this module depends on one.
//
// WHAT IS AND IS NOT OURS NOW
//
// Passwords, their hashing, their reset emails, and eventually verification, MFA
// and Google sign-in are Identity Platform's. Which organisation somebody
// belongs to, what they may do in it, and everything they have drawn stay ours.
// The join between the two is `User.identityUid`.
//
// ENUMERATION, AND WHY THE ERROR ENUM IS COARSE
//
// The live service answers `INVALID_LOGIN_CREDENTIALS` to a wrong password and
// to an address it has never seen, and answers 200 to a reset request for both.
// That is email-enumeration protection, it is on by default, and it is a
// property this code must not undo by inferring "no such account" from a
// refusal. So there is no `email-not-found` in the enum below: sign-in failure
// is one value, and every caller treats it as one.
//
// DEGRADING RATHER THAN CRASHING
//
// With no environment set, `identityConfig` returns null and every call answers
// `not-configured`. That is deliberate and load-bearing: several tracks and the
// whole test suite run against this tree, and a missing variable must not take
// sign-in down. Callers fall back to the legacy `passwordHash` column, which is
// exactly the state of the world before this change.
//
// NOTHING RAW ESCAPES
//
// A provider's own error text can carry a key fragment, an address list, or a
// project id. Responses are translated into the enum below and nothing else;
// unexpected shapes are captured against an `err_<hex>` ref and reported as
// `unavailable`.

import { captureError } from '@/modules/monitoring'

/** Where to send Identity Toolkit calls, and with which key. */
export interface IdentityConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly tenantId: string | null
}

/**
 * Why a call did not succeed.
 *
 * Deliberately coarse: these are the only distinctions any caller acts on, and a
 * wider enum would tempt somebody into putting one of them on a screen, which is
 * how "no account with that email" gets published.
 */
export type IdentityFailure =
  | 'not-configured'
  | 'invalid-credentials'
  | 'email-exists'
  | 'weak-password'
  | 'disabled'
  | 'unavailable'

export type IdentityResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: IdentityFailure; ref?: string }

/**
 * The boundary the rest of the app talks to.
 *
 * Named as an interface so unit tests can substitute an in-memory directory and
 * stay hermetic: the suite runs constantly, several tracks depend on it, and it
 * must never start requiring a network or a credential to pass. The live proof
 * that the real service agrees with this shape is an end-to-end run, not a test.
 */
export interface IdentityClient {
  configured(): boolean
  verifyPassword(email: string, password: string): Promise<IdentityResult<{ uid: string }>>
  createUser(email: string, password: string): Promise<IdentityResult<{ uid: string }>>
  sendPasswordReset(email: string): Promise<IdentityResult<null>>
}

const API_KEY_ENV = 'IDENTITY_PLATFORM_API_KEY'
const TENANT_ENV = 'IDENTITY_PLATFORM_TENANT_ID'
const BASE_URL = 'https://identitytoolkit.googleapis.com/v1'

/**
 * A call out to an identity service is now something an attacker can make this
 * server do repeatedly, so it gets a deadline. Without one, the provider having
 * a bad minute becomes every sign-in holding a connection open.
 */
const REQUEST_TIMEOUT_MS = 8_000

/**
 * Just enough of an environment to read three names out of.
 *
 * Narrower than `NodeJS.ProcessEnv` on purpose: that type requires `NODE_ENV`,
 * so a test could not hand this function a two-key object without inventing one,
 * and a config reader has no business caring.
 */
export type EnvSource = Record<string, string | undefined>

function trimmed(value: string | undefined): string | null {
  const text = value?.trim()
  return text && text.length > 0 ? text : null
}

/**
 * Resolve where to talk, or null when Identity Platform is not set up.
 *
 * The API key is a browser key by design. It names the project and grants
 * nothing on its own: no admin endpoint is reachable with it, and the three
 * endpoints that are reachable all demand a password before they do anything.
 * That is why it is safe in a query string, and why this module needs no
 * service-account credential.
 */
export function identityConfig(env: EnvSource = process.env): IdentityConfig | null {
  const apiKey = trimmed(env[API_KEY_ENV])
  if (!apiKey) return null
  return { baseUrl: BASE_URL, apiKey, tenantId: trimmed(env[TENANT_ENV]) }
}

/**
 * Identity Toolkit reports failures as a short SCREAMING_CASE token in
 * `error.message`, sometimes followed by a colon and a sentence. Only the token
 * is read, and only the tokens below are recognised.
 */
function classify(code: string): IdentityFailure | null {
  const head = code.split(':')[0]?.trim() ?? ''
  switch (head) {
    // The live service collapses all three of these into the middle one. The
    // older two are still listed because a project with email-enumeration
    // protection switched off emits them, and this must behave the same either
    // way rather than treating an unknown address as a server fault.
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
      return 'invalid-credentials'
    case 'EMAIL_EXISTS':
      return 'email-exists'
    case 'WEAK_PASSWORD':
      return 'weak-password'
    case 'USER_DISABLED':
    case 'OPERATION_NOT_ALLOWED':
    case 'ADMIN_ONLY_OPERATION':
    case 'PASSWORD_LOGIN_DISABLED':
      return 'disabled'
    default:
      return null
  }
}

interface IdentityErrorBody {
  error?: { message?: unknown }
}

interface AccountResponse {
  localId?: unknown
}

/** One Identity Toolkit POST. */
async function post<T>(
  config: IdentityConfig,
  method: string,
  body: Record<string, unknown>,
): Promise<IdentityResult<T>> {
  const payload = config.tenantId ? { ...body, tenantId: config.tenantId } : body

  let response: Response
  try {
    response = await fetch(
      `${config.baseUrl}/accounts:${method}?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      },
    )
  } catch (cause) {
    const report = captureError({
      error: cause,
      code: 'identity.unreachable',
      origin: 'server',
      route: `identitytoolkit/${method}`,
    })
    return { ok: false, failure: 'unavailable', ref: report.errorRef }
  }

  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }

  if (response.ok) return { ok: true, data: parsed as T }

  const raw = (parsed as IdentityErrorBody | null)?.error?.message
  const failure = typeof raw === 'string' ? classify(raw) : null
  if (failure) return { ok: false, failure }

  // An unrecognised refusal. The provider's sentence never leaves the server: it
  // is recorded scrubbed against a ref, and only the ref travels.
  const report = captureError({
    error: new Error(`identity toolkit ${method} returned ${response.status}`),
    code: 'identity.unexpected_response',
    origin: 'server',
    route: `identitytoolkit/${method}`,
  })
  return { ok: false, failure: 'unavailable', ref: report.errorRef }
}

function uidFrom(data: AccountResponse, method: string): IdentityResult<{ uid: string }> {
  const uid = data.localId
  if (typeof uid !== 'string' || uid.length === 0) {
    const report = captureError({
      error: new Error(`identity toolkit ${method} returned no localId`),
      code: 'identity.missing_uid',
      origin: 'server',
    })
    return { ok: false, failure: 'unavailable', ref: report.errorRef }
  }
  return { ok: true, data: { uid } }
}

const NOT_CONFIGURED = { ok: false, failure: 'not-configured' } as const

/** The real client. Everything below is a thin wrapper over `post`. */
export const httpIdentityClient: IdentityClient = {
  configured(): boolean {
    return identityConfig() !== null
  },

  /**
   * Check an email and password against Identity Platform.
   *
   * Note what is deliberately NOT returned: the id token and refresh token are
   * dropped. NextAuth is still the session layer, so a second set of session
   * credentials would be one more thing to store, expire and leak for no
   * benefit. All this call is asked for is a yes or a no, plus the identifier to
   * join on.
   */
  async verifyPassword(email, password) {
    const config = identityConfig()
    if (!config) return NOT_CONFIGURED
    const result = await post<AccountResponse>(config, 'signInWithPassword', {
      email,
      password,
      returnSecureToken: false,
    })
    return result.ok ? uidFrom(result.data, 'signInWithPassword') : result
  },

  /**
   * Create the Identity Platform account for an address.
   *
   * Called from exactly two places: accepting an invite, and moving a
   * pre-Identity-Platform account across on the first sign-in that proves its
   * password. Both hand the password over once and neither keeps it.
   */
  async createUser(email, password) {
    const config = identityConfig()
    if (!config) return NOT_CONFIGURED
    const result = await post<AccountResponse>(config, 'signUp', {
      email,
      password,
      returnSecureToken: false,
    })
    return result.ok ? uidFrom(result.data, 'signUp') : result
  },

  /**
   * Ask Identity Platform to email a password-reset link.
   *
   * This is the prize in moving credentials across: the mail goes out from
   * Google, so a builder who forgets their password is not blocked on this
   * product having a mail provider of its own.
   *
   * The live service answers 200 for an address it has never seen, so this call
   * is enumeration-safe at the source. The caller still gives an identical
   * answer either way rather than relying on that.
   */
  async sendPasswordReset(email) {
    const config = identityConfig()
    if (!config) return NOT_CONFIGURED
    const result = await post<unknown>(config, 'sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email,
    })
    return result.ok ? { ok: true, data: null } : result
  },
}

let active: IdentityClient = httpIdentityClient

/** The client in force. Call this rather than importing `httpIdentityClient`. */
export function identity(): IdentityClient {
  return active
}

/**
 * Test seam. Swap in a fake directory, then restore with `null`.
 *
 * A module-level override rather than constructor injection because the call
 * sites are `authorize` inside the NextAuth config and two server actions, none
 * of which owns a place to thread a dependency through. Nothing in application
 * code may call this.
 */
export function setIdentityClient(client: IdentityClient | null): void {
  active = client ?? httpIdentityClient
}

export function identityConfigured(): boolean {
  return active.configured()
}
