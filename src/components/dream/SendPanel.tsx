'use client'

// The one thing this page asks for, asked after it has given something.
//
// THE LINK COMES FIRST, AND THAT IS NOT A LAYOUT CHOICE
//
// A homeowner deciding on a pool is half of a couple, and the thing that
// actually gets sent is one person showing the other what they just built. The
// link does that today, with no address and no waiting, so it is the top half
// of this panel.
//
// The email form underneath asks for something different and says so: a builder
// picking the design up. It deliberately does not offer to email anybody their
// drawing, because there is no mail provider wired yet
// (`docs/beta-operations.md`) and nothing on this page may claim otherwise. The
// front door page carries the same rule in capitals for the same reason: a
// promise a stranger can check within five minutes is the worst possible place
// to be optimistic.
//
// Nothing here is required except the address. The postcode and the timeframe
// are there because a builder picking this up wants to know where the yard is
// and how soon, and both are easy to skip.

import { useState } from 'react'

import { TIMEFRAME_OPTIONS } from '@/modules/dream/lead/schema'

interface SendPanelProps {
  readonly design: string
  readonly ballparkLow: number
  readonly ballparkHigh: number
  readonly shareUrl: string
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; message: string }
  | { kind: 'failed'; message: string }

export function SendPanel({ design, ballparkLow, ballparkHigh, shareUrl }: SendPanelProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status.kind === 'sending') return
    setStatus({ kind: 'sending' })

    const form = new FormData(event.currentTarget)
    const payload = {
      email: String(form.get('email') ?? ''),
      name: String(form.get('name') ?? ''),
      postcode: String(form.get('postcode') ?? ''),
      timeframe: String(form.get('timeframe') ?? ''),
      website: String(form.get('website') ?? ''),
      design,
      ballparkLow: Math.round(ballparkLow),
      ballparkHigh: Math.round(ballparkHigh),
      source: 'dream-studio',
    }

    try {
      const res = await fetch('/api/dream/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body: unknown = await res.json().catch(() => ({}))
      const message = readMessage(body)
      if (res.ok) {
        setStatus({ kind: 'sent', message: message ?? 'Saved.' })
      } else {
        setStatus({ kind: 'failed', message: message ?? 'That did not go through. Try again in a moment.' })
      }
    } catch {
      // A network failure is the visitor's connection far more often than it is
      // ours, and telling them to check it is more useful than an apology.
      setStatus({ kind: 'failed', message: 'That did not go through. Check your connection and try again.' })
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    } catch {
      // Clipboard access can be refused, and there is a visible input holding
      // the same link for exactly this case. Nothing to report.
    }
  }

  return (
    <div className="border p-4 dream-rule" style={{ background: '#fff' }}>
      <h2 className="text-[15px] font-semibold leading-tight">Send this to someone</h2>
      <p className="mt-1 text-[12.5px]" style={{ color: 'var(--pencil)' }}>
        This link holds the whole backyard. Paste it into a message and it opens exactly
        what is on screen.
      </p>

      <div className="mt-2.5 flex gap-2">
        <input
          readOnly
          value={shareUrl}
          aria-label="Link to this design"
          onFocus={(e) => e.currentTarget.select()}
          // Deliberately not `dream-annotation`: that face is upper-cased, and
          // a link shown in capitals looks broken and gets retyped wrong.
          className="min-w-0 flex-1 border px-2 py-2 font-mono text-[12px] dream-rule"
          style={{ background: 'var(--paper-sunk)' }}
        />
        <button
          type="button"
          onClick={copyLink}
          className="shrink-0 px-3 py-2 text-[13px] font-medium"
          style={{ background: 'var(--graphite)', color: 'var(--paper)' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 border-t pt-3.5 dream-rule">
        {status.kind === 'sent' ? (
          <>
            <p className="text-[14px] font-medium">{status.message}</p>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--pencil)' }}>
              Nobody else gets your address.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-[14px] font-semibold leading-tight">
              Want it priced properly?
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--pencil)' }}>
              Leave your details and a builder who works in your area can pick this design
              up and quote it against your actual yard.
            </p>

            <form onSubmit={submit} className="mt-3 grid gap-2.5">
              <Input name="email" type="email" required label="Email" placeholder="you@example.com" />
              <div className="grid grid-cols-2 gap-2.5">
                <Input name="name" label="Name" placeholder="Optional" />
                <Input name="postcode" label="Zip" placeholder="Optional" />
              </div>

              <label className="grid gap-1">
                <span className="dream-annotation text-[10px]" style={{ color: 'var(--pencil)' }}>
                  When
                </span>
                <select
                  name="timeframe"
                  defaultValue="this-year"
                  className="border px-2.5 py-2 text-[13px] dream-rule"
                  style={{ background: '#fff' }}
                >
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Not shown to anybody, not filled by anybody. See `handler.ts`. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              <button
                type="submit"
                disabled={status.kind === 'sending'}
                className="mt-1 border px-3 py-2.5 text-[13.5px] font-medium dream-rule disabled:opacity-60"
                style={{ background: '#fff' }}
              >
                {status.kind === 'sending' ? 'Saving' : 'Ask a builder to quote this'}
              </button>

              {status.kind === 'failed' && (
                <p role="alert" className="text-[12.5px]" style={{ color: 'var(--redline)' }}>
                  {status.message}
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function Input({
  name,
  label,
  type = 'text',
  required = false,
  placeholder,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <label className="grid gap-1">
      <span className="dream-annotation text-[10px]" style={{ color: 'var(--pencil)' }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        autoComplete={type === 'email' ? 'email' : 'off'}
        className="border px-2.5 py-2 text-[13px] dream-rule"
        style={{ background: '#fff' }}
      />
    </label>
  )
}

/** Pull the server's sentence out of a response body without trusting its shape. */
function readMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const value = record['message'] ?? record['error']
  return typeof value === 'string' && value.length > 0 ? value : null
}
