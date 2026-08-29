'use client'

// The homeowner's upload form. Mobile-first: the primary control is a
// full-width tap target wired to a camera-capable file input, and drag-and-drop
// is layered on top for the desktop case rather than being the only way in.
//
// Client-side checks here are courtesy, not enforcement. Every cap is enforced
// again server-side, because anything in this file is under the caller's
// control.

import { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ALLOWED_MIME_TYPES,
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_BYTES,
} from '@/modules/imports/intake/constants'

const ACCEPT_ATTRIBUTE = [...ALLOWED_MIME_TYPES].join(',')
const MAX_MB = Math.round(MAX_IMAGE_BYTES / (1024 * 1024))

type Phase = 'idle' | 'sending' | 'sent'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface IntakeUploadFormProps {
  token: string
  orgName: string
}

export function IntakeUploadForm({ token, orgName }: IntakeUploadFormProps) {
  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  const addFiles = useCallback((incoming: FileList | null) => {
    if (incoming === null) return
    setError(null)
    setFiles((current) => {
      const next = [...current]
      for (const file of Array.from(incoming)) {
        if (next.length >= MAX_IMAGES_PER_SESSION) {
          setError(`You can send up to ${MAX_IMAGES_PER_SESSION} files at a time.`)
          break
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setError(`Each file needs to be under ${MAX_MB} MB.`)
          continue
        }
        if (file.size === 0) continue
        const duplicate = next.some(
          (existing) => existing.name === file.name && existing.size === file.size,
        )
        if (!duplicate) next.push(file)
      }
      return next
    })
  }, [])

  const removeAt = useCallback((index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }, [])

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (files.length === 0) {
        setError('Please add at least one photo or document.')
        return
      }
      setPhase('sending')
      setError(null)

      const form = event.currentTarget
      const data = new FormData()
      const read = (name: string): string => {
        const field = form.elements.namedItem(name)
        return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
          ? field.value
          : ''
      }
      data.set('customerName', read('customerName'))
      data.set('email', read('email'))
      data.set('phone', read('phone'))
      data.set('notes', read('notes'))
      for (const file of files) data.append('images', file)

      try {
        const res = await fetch(`/api/intake/${encodeURIComponent(token)}`, {
          method: 'POST',
          body: data,
        })
        const json: unknown = await res.json().catch(() => null)
        if (res.ok) {
          setPhase('sent')
          return
        }
        const message =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as { error: unknown }).error)
            : 'That upload could not be sent. Please try again.'
        setError(message)
        setPhase('idle')
      } catch {
        setError('That upload could not be sent. Please check your connection and try again.')
        setPhase('idle')
      }
    },
    [files, token],
  )

  if (phase === 'sent') {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center"
        role="status"
      >
        <h2 className="text-lg font-semibold text-emerald-900">Got it, thank you.</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Your photos are with {orgName}. Someone will be in touch about your pool.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <p className="text-base font-medium text-slate-900">Add your photos</p>
        <p className="mt-1 text-sm text-slate-600">
          Inspiration pictures, a sketch, a survey, or a photo of your yard.
        </p>

        <input
          ref={inputRef}
          type="file"
          name={'images'}
          multiple
          accept={ACCEPT_ATTRIBUTE}
          // `capture` opens the camera directly on a phone, which is where most
          // of these submissions come from.
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <Button
          type="button"
          size="lg"
          className="mt-4 w-full"
          onClick={() => inputRef.current?.click()}
        >
          Choose photos or take one
        </Button>
        <p className="mt-3 text-xs text-slate-500">
          Up to {MAX_IMAGES_PER_SESSION} files, {MAX_MB} MB each. Photos and PDFs.
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-slate-800">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                aria-label={`Remove file ${index + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
          <li className="px-3 text-xs text-slate-500">
            {files.length} file{files.length === 1 ? '' : 's'}, {formatSize(totalBytes)} total
          </li>
        </ul>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="customerName">Your name</Label>
          <Input id="customerName" name="customerName" autoComplete="name" maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Anything you want us to know</Label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            maxLength={4000}
            placeholder="Size you have in mind, features you like, where it goes in the yard."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <p className="text-xs text-slate-500">All of this is optional. The photos are the point.</p>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={phase === 'sending'}>
        {phase === 'sending' ? 'Sending...' : `Send to ${orgName}`}
      </Button>
    </form>
  )
}
