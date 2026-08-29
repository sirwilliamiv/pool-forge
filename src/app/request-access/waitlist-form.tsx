'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TEAM_SIZE_OPTIONS, USES_TODAY_OPTIONS } from '@/modules/waitlist/schema'

const FIELD_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

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
      <div
        className="rounded-pfLg border border-borderLight bg-background p-8 shadow-pfMd"
        data-testid="waitlist-done"
      >
        <h2 className="text-xl font-semibold tracking-tight">Thanks. You are on the list.</h2>
        <p className="mt-3 text-sm leading-relaxed text-textMuted">
          We read every one of these ourselves. If you fit the group we are onboarding now, you
          will hear from us directly, and if the timing is wrong we will come back to you as we
          open up.
        </p>
        <p className="mt-6 text-sm text-textMuted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-pfAccentStrong underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div
      id="request-access"
      className="rounded-pfLg border border-borderLight bg-background p-6 shadow-pfMd sm:p-8"
    >
      <h2 className="text-xl font-semibold tracking-tight">Ask for access</h2>
      <p className="mt-2 text-sm leading-relaxed text-textMuted">
        Two of these decide who we call first: how many people would be quoting with it, and what
        you estimate with today.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wl-name">Your name</Label>
            <Input id="wl-name" name="name" type="text" autoComplete="name" maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-company">Company</Label>
            <Input
              id="wl-company"
              name="company"
              type="text"
              autoComplete="organization"
              maxLength={160}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="wl-email">Email</Label>
            <span className="text-xs text-textMuted">Required</span>
          </div>
          <Input
            id="wl-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-phone">Phone</Label>
          <Input id="wl-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wl-team-size">How many people would use it</Label>
            <select id="wl-team-size" name="teamSize" className={FIELD_CLASS} defaultValue="">
              <option value="">Select one</option>
              {TEAM_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-uses-today">What you estimate with today</Label>
            <select id="wl-uses-today" name="usesToday" className={FIELD_CLASS} defaultValue="">
              <option value="">Select one</option>
              {USES_TODAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-note">Anything else worth knowing</Label>
          <textarea
            id="wl-note"
            name="note"
            rows={3}
            maxLength={2000}
            className={`${FIELD_CLASS} h-auto min-h-[80px] resize-y`}
            placeholder="How many pools a year, what you build, what makes quoting slow right now."
          />
        </div>

        {/* Not for people. Left in the tab order's shadow and out of the
            accessibility tree; a submission that fills it is answered exactly
            like every other one. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="wl-website">Website</label>
          <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div aria-live="polite">
          {error === null ? null : (
            <p className="text-sm text-pfError" data-testid="waitlist-error">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={pending || !ready}>
          {pending ? 'Sending…' : 'Request access'}
        </Button>

        <p className="text-xs leading-relaxed text-textMuted">
          We use this to decide who to onboard next and to get in touch about it. Nothing else, and
          no newsletter.
        </p>
      </form>
    </div>
  )
}
