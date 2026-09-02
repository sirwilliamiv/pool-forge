'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AddressSuggestion } from '@/modules/site/geo/types'

export interface ResolvedAddress {
  formattedAddress: string
  lat: number
  lng: number
  placeId: string
}

/** Keystrokes settle before the proxy is asked; Google bills per session anyway. */
const SUGGEST_DELAY_MS = 250

/**
 * The one address field, autocomplete-backed.
 *
 * Talks only to this app's own proxy routes (`/api/site/autocomplete`,
 * `/api/site/place`): the Google key never reaches the browser. Without a
 * configured key the routes answer 503 and this degrades to a plain text
 * input, which still saves — the feature being off must not block typing an
 * address by hand.
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  onResolved,
  mapsEnabled,
  placeholder,
  describedBy,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onResolved: (resolved: ResolvedAddress) => void
  mapsEnabled: boolean
  placeholder?: string | undefined
  describedBy?: string | undefined
}) {
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([])
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** One billing session per address entry, minted lazily, retired on pick. */
  const sessionToken = React.useRef<string | null>(null)
  /** True right after a pick, so the value change it causes doesn't re-open the list. */
  const suppress = React.useRef(false)
  /** The stored address arriving on mount is not a query; only typing is. */
  const touched = React.useRef(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const listId = `${id}-suggestions`

  function token(): string {
    if (!sessionToken.current) sessionToken.current = crypto.randomUUID()
    return sessionToken.current
  }

  React.useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (suppress.current) {
      suppress.current = false
      return
    }
    if (!touched.current || !mapsEnabled || value.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(async () => {
      timer.current = null
      try {
        const res = await fetch(
          `/api/site/autocomplete?q=${encodeURIComponent(value.trim())}&session=${token()}`,
        )
        if (!res.ok) {
          setSuggestions([])
          setOpen(false)
          return
        }
        const json = (await res.json()) as { suggestions?: AddressSuggestion[] }
        const next = json.suggestions ?? []
        setSuggestions(next)
        setActive(0)
        setOpen(next.length > 0)
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, SUGGEST_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, mapsEnabled])

  // Clicking anywhere else closes the list.
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  async function pick(suggestion: AddressSuggestion) {
    suppress.current = true
    setOpen(false)
    setSuggestions([])
    onChange(suggestion.description)
    const session = token()
    // The session ends with the pick: the Details call closes the billing
    // session, and the next keystroke starts a fresh one.
    sessionToken.current = null
    try {
      const res = await fetch(
        `/api/site/place?placeId=${encodeURIComponent(suggestion.placeId)}&session=${session}`,
      )
      if (!res.ok) return
      const json = (await res.json()) as {
        ok: boolean
        location?: { lat: number; lng: number; formattedAddress: string }
      }
      if (!json.ok || !json.location) return
      onResolved({
        formattedAddress: json.location.formattedAddress,
        lat: json.location.lat,
        lng: json.location.lng,
        placeId: suggestion.placeId,
      })
    } catch {
      // The typed text is already in the field; resolution is best-effort.
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(suggestions.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      const chosen = suggestions[active]
      if (chosen) {
        e.preventDefault()
        void pick(chosen)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="street-address"
        placeholder={placeholder ?? '123 Poinciana Ave, Tampa, FL'}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          touched.current = true
          onChange(e.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-brand border border-theme-line bg-theme-bg shadow-elevation1"
        >
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left text-bodyS transition-colors duration-brand ease-brand ${
                  i === active ? 'bg-theme-card text-theme-fg' : 'text-theme-muted hover:bg-theme-card hover:text-theme-fg'
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => void pick(s)}
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
