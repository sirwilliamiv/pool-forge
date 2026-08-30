'use client'

// Builder-side management for customer intake links.
//
// Every mutation goes through `dispatch()` into the command registry. No Prisma
// call is reachable from anything in this file, which is the repo's
// command-registry-first rule: the same three commands back these buttons, a
// future hotkey, and the voice agent.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import { dispatch } from '@/lib/commands/dispatch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface IntakeLinkView {
  id: string
  label: string
  url: string
  active: boolean
  expiresAt: string | null
  createdAt: string
  submissionCount: number
}

interface LinkOutput {
  linkId: string
}

export function IntakeLinksPanel({ links }: { links: IntakeLinkView[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const create = useCallback(async () => {
    const trimmed = label.trim()
    if (trimmed.length === 0) {
      setError('Give the link a label so you can tell it apart later.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await dispatch<{ label: string }, LinkOutput>('import.intake.link.create', {
      label: trimmed,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setLabel('')
    router.refresh()
  }, [label, router])

  const setActive = useCallback(
    async (linkId: string, active: boolean) => {
      setBusy(true)
      setError(null)
      const result = await dispatch<{ linkId: string; active: boolean }, LinkOutput>(
        'import.intake.link.update',
        { linkId, active },
      )
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    },
    [router],
  )

  const rename = useCallback(
    async (linkId: string, current: string) => {
      const next = window.prompt('Label for this link', current)
      if (next === null) return
      const trimmed = next.trim()
      if (trimmed.length === 0 || trimmed === current) return
      setBusy(true)
      setError(null)
      const result = await dispatch<{ linkId: string; label: string }, LinkOutput>(
        'import.intake.link.update',
        { linkId, label: trimmed },
      )
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    },
    [router],
  )

  const copy = useCallback(async (link: IntakeLinkView) => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.id)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('Could not copy. Select the link and copy it manually.')
    }
  }, [])

  return (
    <div className="space-y-6" data-guide-scope="intake-links">
      <div className="rounded-brand16 border border-theme-line bg-theme-bg p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="intake-label">New link label</Label>
            <Input
              id="intake-label"
              value={label}
              placeholder="Spring campaign, Yard signs, Website contact form"
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
              }}
            />
          </div>
          <Button onClick={() => void create()} disabled={busy}>
            Create link
          </Button>
        </div>
        <p className="mt-2 text-bodyS text-theme-muted">
          The label is for you. Customers only ever see your company name.
        </p>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-brand bg-[color-mix(in_oklch,var(--brand-red),transparent_88%)] px-3 py-2 text-bodyS text-brand-red">
          {error}
        </p>
      )}

      {links.length === 0 ? (
        <div className="rounded-brand16 border border-dashed border-theme-line p-10 text-center text-bodyS text-theme-muted">
          No upload links yet. Create one and send it to a customer.
        </div>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.id} className="rounded-brand16 border border-theme-line bg-theme-bg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-bodyL font-medium text-theme-fg">{link.label}</span>
                    <span
                      className={`rounded-brand px-2 py-0.5 font-brandMono text-formLabel uppercase ${
                        link.active
                          ? 'bg-tint-honeydew text-brand-green'
                          : 'bg-theme-card text-theme-muted'
                      }`}
                    >
                      {link.active ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-brandMono text-formLabel text-theme-muted">
                    {link.url}
                  </p>
                  <p className="mt-1 font-brandMono text-formLabel text-theme-muted">
                    {link.submissionCount} submission{link.submissionCount === 1 ? '' : 's'}
                    {' · created '}
                    {link.createdAt}
                    {link.expiresAt !== null ? ` · expires ${link.expiresAt}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copy(link)}>
                    {copied === link.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void rename(link.id, link.label)}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant={link.active ? 'outline' : 'default'}
                    disabled={busy}
                    onClick={() => void setActive(link.id, !link.active)}
                  >
                    {link.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
