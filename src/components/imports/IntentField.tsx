'use client'

import { useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confidenceBand } from '@/modules/imports/intent'
import type { DesignIntent } from '@/modules/imports/intent'
import type { DesignIntentPatch } from '@/modules/imports/patch'
import { BAND_RAIL_CLASSES, ConfidenceBadge } from './ConfidenceBadge'
import { fieldDomId, type IntentFieldDescriptor } from './intent-fields'

// One correctable field.
//
// The row never holds the committed value: `text` is draft keystrokes only,
// and the displayed value comes back from the server through `intent`. That is
// the whole point of routing every edit through `import.intent.patch` rather
// than through local state, because the patch is what records what the model
// got wrong.

export interface IntentFieldRowProps {
  descriptor: IntentFieldDescriptor
  intent: DesignIntent
  /** Null when the extractor never scored this path. */
  score: number | null
  /** True when this path is one of the ones blocking an apply. */
  blocking: boolean
  pending: boolean
  disabled: boolean
  onCommit: (path: string, patch: DesignIntentPatch) => void
}

function displayString(value: string | number | boolean | null): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') {
    const rounded = Math.round(value * 100) / 100
    return String(rounded)
  }
  return value
}

function humaniseOption(option: string): string {
  const spaced = option.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function IntentFieldRow({
  descriptor,
  intent,
  score,
  blocking,
  pending,
  disabled,
  onCommit,
}: IntentFieldRowProps) {
  const controlId = useId()
  const committed = descriptor.read(intent)
  const [text, setText] = useState(() => displayString(committed))
  const [rejected, setRejected] = useState(false)

  // The server is the source of truth: whenever a patch round-trips, the row
  // snaps back to whatever was actually persisted.
  useEffect(() => {
    setText(displayString(committed))
    setRejected(false)
  }, [committed])

  const band = score === null ? null : confidenceBand(score)
  const rail = band === null ? 'bg-theme-line' : BAND_RAIL_CLASSES[band]

  function commitRaw(raw: string | boolean) {
    const patch = descriptor.write(raw)
    if (patch === null) {
      setRejected(true)
      setText(displayString(committed))
      return
    }
    setRejected(false)
    onCommit(descriptor.path, patch)
  }

  function commitText() {
    if (text === displayString(committed)) return
    commitRaw(text)
  }

  return (
    <div
      id={fieldDomId(descriptor.path)}
      data-path={descriptor.path}
      data-blocking={blocking ? 'true' : 'false'}
      tabIndex={-1}
      className={cn(
        'group relative flex scroll-mt-24 items-start gap-3 py-2 pl-4 pr-3 outline-none transition-colors duration-brand ease-brand',
        'focus-visible:bg-family-tint',
        blocking ? 'bg-tint-blush/50' : 'hover:bg-theme-card',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-1 left-0 w-[3px] rounded-full', rail)}
      />

      <div className="min-w-0 flex-1 pt-0.5">
        <label
          htmlFor={descriptor.control.kind === 'boolean' ? undefined : controlId}
          className="block text-bodyS font-medium leading-tight text-theme-fg"
        >
          {descriptor.label}
        </label>
        <p className="mt-0.5 text-formLabel leading-tight text-theme-muted">{descriptor.hint}</p>
        {blocking ? (
          <p className="mt-1 text-formLabel font-medium leading-tight text-brand-red">
            Correct or confirm this before applying.
          </p>
        ) : null}
        {rejected ? (
          <p className="mt-1 text-formLabel leading-tight text-brand-red">
            That value is not usable here, so nothing was saved.
          </p>
        ) : null}
      </div>

      <div className="flex w-[160px] shrink-0 flex-col items-end gap-1">
        {descriptor.control.kind === 'number' ? (
          <div
            className={cn(
              'flex w-full items-center gap-1 rounded-brand4 border px-2 focus-within:ring-2 focus-within:ring-family-accent',
              blocking
                ? 'border-brand-red/50 bg-theme-bg'
                : 'border-transparent bg-theme-card focus-within:bg-theme-bg',
            )}
          >
            <input
              id={controlId}
              type="number"
              inputMode="decimal"
              step={descriptor.control.step}
              value={text}
              disabled={disabled}
              placeholder="Not read"
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="w-full bg-transparent py-1.5 text-right text-bodyS tabular-nums outline-none disabled:opacity-50"
            />
            <span className="font-brandMono text-formLabel uppercase tracking-wider text-theme-muted">
              {descriptor.control.unit}
            </span>
          </div>
        ) : null}

        {descriptor.control.kind === 'text' ? (
          <input
            id={controlId}
            type="text"
            value={text}
            disabled={disabled}
            placeholder={descriptor.control.placeholder}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className={cn(
              'w-full rounded-brand4 border px-2 py-1.5 text-right text-bodyS outline-none focus:ring-2 focus:ring-family-accent disabled:opacity-50',
              blocking
                ? 'border-brand-red/50 bg-theme-bg'
                : 'border-transparent bg-theme-card focus:bg-theme-bg',
            )}
          />
        ) : null}

        {descriptor.control.kind === 'select' ? (
          <select
            id={controlId}
            value={typeof committed === 'string' ? committed : ''}
            disabled={disabled}
            onChange={(e) => commitRaw(e.target.value)}
            className={cn(
              'w-full rounded-brand4 border px-2 py-1.5 text-right text-bodyS outline-none focus:ring-2 focus:ring-family-accent disabled:opacity-50',
              blocking
                ? 'border-brand-red/50 bg-theme-bg'
                : 'border-transparent bg-theme-card focus:bg-theme-bg',
            )}
          >
            {descriptor.control.options.map((option) => (
              <option key={option} value={option}>
                {humaniseOption(option)}
              </option>
            ))}
          </select>
        ) : null}

        {descriptor.control.kind === 'boolean' ? (
          <div
            role="group"
            aria-label={descriptor.label}
            className="inline-flex overflow-hidden rounded-brand4 border border-theme-line"
          >
            {[true, false].map((option) => (
              <button
                key={String(option)}
                type="button"
                disabled={disabled}
                aria-pressed={committed === option}
                onClick={() => commitRaw(option)}
                className={cn(
                  'px-2.5 py-1 text-formLabel font-medium transition-colors duration-brand ease-brand disabled:opacity-50',
                  committed === option
                    ? 'bg-theme-fg text-theme-bg'
                    : 'bg-theme-bg text-theme-muted hover:bg-theme-card',
                )}
              >
                {option ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-1.5">
          {pending ? (
            <Loader2
              className="h-3 w-3 animate-spin text-theme-faint"
              aria-label="Saving correction"
            />
          ) : null}
          <ConfidenceBadge score={score} />
        </div>
      </div>
    </div>
  )
}
