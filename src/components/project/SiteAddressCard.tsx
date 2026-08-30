'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dispatch } from '@/lib/commands/dispatch'
import { addressSuggestionSchema, type AddressSuggestion } from '@/modules/site/geo/types'

const suggestionsResponseSchema = z.object({
  suggestions: z.array(addressSuggestionSchema),
})

/** How long after the last keystroke before asking for suggestions. */
const DEBOUNCE_MS = 300

/**
 * The site's address, autocompleted against real ones.
 *
 * Typing queries the autocomplete proxy (the key never reaches the browser).
 * Picking a suggestion only fills the input and reveals an explicit confirm
 * button: changing the address rewrites the drawing's satellite geo and
 * deletes the imported building, so it must never happen from a stray click on
 * a suggestion. The confirm dispatches `site.address.set` through the command
 * registry, which geocodes the place, stores the location on the project, and
 * enables Import site in the editor. The session token groups one focus
 * session's keystrokes for Google's billing and is retired on pick.
 */
export function SiteAddressCard({
  projectId,
  initialAddress,
}: {
  projectId: string
  initialAddress: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState(initialAddress ?? '')
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([])
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  /** The picked-but-not-confirmed suggestion; the confirm button shows while set. */
  const [pending, setPending] = React.useState<AddressSuggestion | null>(null)

  /** One token per focus session, minted lazily on the first keystroke. */
  const sessionRef = React.useRef<string | null>(null)
  /** The user has typed; the initial value must not trigger a lookup. */
  const dirtyRef = React.useRef(false)
  /** Drops responses that arrive after a newer request went out. */
  const seqRef = React.useRef(0)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  function onChange(value: string) {
    setQuery(value)
    setState('idle')
    setError(null)
    // Typing again is a change of mind: the confirm button goes away until a
    // new suggestion is picked.
    setPending(null)
    dirtyRef.current = true
    if (sessionRef.current === null) sessionRef.current = crypto.randomUUID()
    if (timerRef.current) clearTimeout(timerRef.current)

    const trimmed = value.trim()
    if (trimmed.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    timerRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      try {
        const res = await fetch(
          `/api/site/autocomplete?q=${encodeURIComponent(trimmed)}&session=${sessionRef.current}`,
        )
        if (!res.ok) return
        const parsed = suggestionsResponseSchema.safeParse(await res.json())
        if (!parsed.success || seq !== seqRef.current) return
        setSuggestions(parsed.data.suggestions)
        setHighlight(0)
        setOpen(parsed.data.suggestions.length > 0)
      } catch {
        // Suggestions are a convenience; a failed lookup is silence, not an error.
      }
    }, DEBOUNCE_MS)
  }

  function pick(suggestion: AddressSuggestion) {
    setOpen(false)
    setSuggestions([])
    setQuery(suggestion.description)
    // The billing session ends when the place is resolved; the next focus
    // session mints a fresh token.
    sessionRef.current = null
    setState('idle')
    setError(null)
    // Picking only proposes. Nothing is dispatched until the person confirms:
    // setting the address rewrites the drawing's site data, which is too much
    // to hang off a click in a dropdown.
    setPending(suggestion)
  }

  async function confirm() {
    if (!pending || state === 'saving') return
    setState('saving')
    setError(null)

    const result = await dispatch('site.address.set', {
      projectId,
      placeId: pending.placeId,
    })
    if (!result.ok) {
      // The pick stands so the confirm can simply be tried again.
      setState('error')
      setError(result.error)
      return
    }
    setPending(null)
    setState('saved')
    // The address and location were written server-side; the page reads them
    // from the server, so re-render it.
    router.refresh()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false)
      // Enter while the confirm button shows is the confirm.
      if (e.key === 'Enter' && pending) {
        e.preventDefault()
        void confirm()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = suggestions[highlight]
      if (chosen) pick(chosen)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site address</CardTitle>
        <CardDescription>
          The property this pool is being built on. Picking an address locates the site and enables
          Import site in the editor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative max-w-xl">
          <Label htmlFor="site-address">Address</Label>
          <Input
            id="site-address"
            role="combobox"
            aria-expanded={open}
            aria-controls="site-address-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Start typing the street address…"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (suggestions.length > 0 && dirtyRef.current) setOpen(true)
            }}
            onBlur={() => {
              // After the click on a suggestion lands; a plain close would
              // swallow the mousedown that was about to pick it.
              setTimeout(() => setOpen(false), 150)
            }}
            className="mt-1.5"
          />
          {open ? (
            <ul
              id="site-address-suggestions"
              role="listbox"
              className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.placeId}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(suggestion)
                  }}
                  className={
                    'cursor-pointer rounded-sm px-2 py-1.5 text-bodyS ' +
                    (index === highlight ? 'bg-accent text-accent-foreground' : '')
                  }
                >
                  {suggestion.description}
                </li>
              ))}
            </ul>
          ) : null}
          {pending ? (
            <Button type="button" size="sm" className="mt-2" disabled={state === 'saving'} onClick={() => void confirm()}>
              Set as project address
            </Button>
          ) : null}
          <p className="mt-1.5 text-bodyS text-theme-muted" aria-live="polite">
            {state === 'saving'
              ? 'Locating…'
              : state === 'saved'
                ? 'Saved. Import site is now available in the editor.'
                : state === 'error'
                  ? (error ?? 'Could not set the address.')
                  : pending
                    ? 'Not set yet. Confirm to use this address.'
                    : initialAddress
                      ? `Saved: ${initialAddress}`
                      : 'No site address on this project yet.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
