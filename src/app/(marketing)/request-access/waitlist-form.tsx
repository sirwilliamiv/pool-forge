'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { TEAM_SIZE_OPTIONS, USES_TODAY_OPTIONS } from '@/modules/waitlist/schema'

// The form, on the brand chassis rather than on shadcn.
//
// It sits on a marketing page, so it takes the marketing tokens: hairline
// borders at 16% ink, an 8px radius on the button, mono for the field labels,
// and `elevation-1` on the card. That shadow is the exception the bible allows
// for a card whose affordance is softness rather than a border, and it is the
// only shadow in the hero.
//
// What must not change without changing `src/test/e2e/waitlist.spec.ts` with
// it: the visible label text of every field, the accessible name of the submit
// button, and the two test ids.

/**
 * Where they came from, so a campaign can be told apart from word of mouth.
 *
 * Read from `window.location.search` inside an effect rather than through
 * `useSearchParams`, which needs a `<Suspense>` boundary and takes this page
 * off the prerendered path. A missing value is fine: it is a note, not a key.
 */
function useSourceParam(): string {
  const [source, setSource] = useState('')
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('src')
    if (value !== null) setSource(value.slice(0, 120))
  }, [])
  return source
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mk-field">
      <div className="mk-field__head">
        <label className="mk-field__label" htmlFor={id}>
          {label}
        </label>
        {hint ? <span className="mk-field__hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

export function WaitlistForm() {
  const source = useSourceParam()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // The submit is a fetch, so it does not exist until this component has
  // hydrated. Until then the button stays disabled: a native submit at that
  // moment would navigate away as a GET with the visitor's email address in the
  // query string, do nothing, and look like the form is broken.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const payload: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') payload[key] = value
    }
    if (source !== '') payload['source'] = source

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (res.ok) {
        setDone(true)
        return
      }
      setError(body?.error ?? 'Something went wrong at our end. Please try again in a moment.')
    } catch {
      setError('We could not reach the server. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  // One confirmation, and it is the same one whether this address was already
  // on the list or has just been added. Anything else would let a stranger use
  // this form to find out which builders have been talking to us.
  if (done) {
    return (
      <div className="mk-formcard" data-testid="waitlist-done">
        <span className="mk-fan mk-fan--lg" aria-hidden />
        <h2 className="mk-title3" style={{ marginTop: '1.25rem' }}>
          Thanks. You are on the list.
        </h2>
        <p className="mk-body" style={{ marginTop: '0.75rem' }}>
          We read every one of these ourselves. If you fit the group we are onboarding now, you will
          hear from us directly, and if the timing is wrong we will come back to you as we open up.
        </p>
        <p className="mk-caption" style={{ marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <Link href="/login" className="mk-textlink">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div id="request-access" className="mk-formcard">
      <p className="mk-label mk-label--ink">Ask for access</p>
      <p className="mk-body" style={{ marginTop: '0.75rem' }}>
        Two of these decide who we call first: how many people would be quoting with it, and what
        you estimate with today.
      </p>

      <form onSubmit={onSubmit} className="mk-form" noValidate={false}>
        <div className="mk-form__pair">
          <Field id="wl-name" label="Your name">
            <input
              className="mk-input"
              id="wl-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          <Field id="wl-company" label="Company">
            <input
              className="mk-input"
              id="wl-company"
              name="company"
              type="text"
              autoComplete="organization"
              maxLength={160}
            />
          </Field>
        </div>

        <Field id="wl-email" label="Email" hint="Required">
          <input
            className="mk-input"
            id="wl-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </Field>

        <Field id="wl-phone" label="Phone">
          <input
            className="mk-input"
            id="wl-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
          />
        </Field>

        <div className="mk-form__pair">
          <Field id="wl-team-size" label="How many people would use it">
            <select className="mk-input" id="wl-team-size" name="teamSize" defaultValue="">
              <option value="">Select one</option>
              {TEAM_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="wl-uses-today" label="What you estimate with today">
            <select className="mk-input" id="wl-uses-today" name="usesToday" defaultValue="">
              <option value="">Select one</option>
              {USES_TODAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field id="wl-note" label="Anything else worth knowing">
          <textarea
            className="mk-input mk-input--area"
            id="wl-note"
            name="note"
            rows={3}
            maxLength={2000}
            placeholder="How many pools a year, what you build, what makes quoting slow right now."
          />
        </Field>

        {/* Not for people. Left in the tab order's shadow and out of the
            accessibility tree; a submission that fills it is answered exactly
            like every other one. */}
        <div aria-hidden="true" className="mk-honeypot">
          <label htmlFor="wl-website">Website</label>
          <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div aria-live="polite">
          {error === null ? null : (
            <p className="mk-form__error" data-testid="waitlist-error">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="mk-btn mk-btn--primary mk-btn--block"
          disabled={pending || !ready}
        >
          {pending ? 'Sending…' : 'Request access'}
        </button>

        <p className="mk-caption" style={{ fontSize: '0.8125rem' }}>
          We use this to decide who to onboard next and to get in touch about it. Nothing else, and
          no newsletter.
        </p>
      </form>
    </div>
  )
}
