'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DesignIntent, FeatureIntent } from '@/modules/imports/intent'
import type { DesignIntentPatch } from '@/modules/imports/patch'
import { ConfidenceBadge } from './ConfidenceBadge'
import { confidenceFor } from './gates'

// Features are the one part of the intent that is a list, so the whole array
// is replaced on every edit: `applyIntentPatch` replaces rather than
// concatenates precisely so that removing a feature the model invented is
// expressible. Removal is the most common correction here.

export interface FeatureListProps {
  intent: DesignIntent
  disabled: boolean
  pending: boolean
  onCommit: (path: string, patch: DesignIntentPatch) => void
}

function featurePatch(features: FeatureIntent[]): DesignIntentPatch {
  return { features }
}

export function FeatureList({ intent, disabled, pending, onCommit }: FeatureListProps) {
  if (intent.features.length === 0) {
    return (
      <p className="px-4 py-3 text-bodyS text-theme-muted">
        No features were read from the image. Anything the model missed can be added in the editor
        after applying.
      </p>
    )
  }

  function replace(index: number, next: FeatureIntent) {
    const features = intent.features.map((f, i) => (i === index ? next : f))
    onCommit('features', featurePatch(features))
  }

  function remove(index: number) {
    const features = intent.features.filter((_, i) => i !== index)
    onCommit('features', featurePatch(features))
  }

  return (
    <ul className="divide-y divide-theme-lineSoft">
      {intent.features.map((feature, index) => {
        const score =
          confidenceFor(intent, `features.${index}`) ?? confidenceFor(intent, 'features')
        return (
          <li key={`${feature.label}-${index}`} className="px-4 py-2.5 hover:bg-theme-card">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <FeatureText
                  label="Feature"
                  value={feature.label}
                  disabled={disabled}
                  onCommit={(text) => replace(index, { ...feature, label: text })}
                />
                <p className="mt-0.5 text-formLabel leading-tight text-theme-muted">
                  {feature.stencilId === null
                    ? 'No catalog match yet, so it applies as a generic feature'
                    : 'Matched to a catalog stencil'}
                </p>
              </div>
              <ConfidenceBadge score={score} className="mt-1" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(index)}
                aria-label={`Remove ${feature.label}`}
                className="mt-0.5 rounded-brand4 p-1 text-theme-faint transition-colors duration-brand ease-brand hover:bg-tint-blush hover:text-brand-red disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <FeatureNumber
                label="Qty"
                value={feature.count}
                step={1}
                disabled={disabled}
                onCommit={(n) => {
                  if (n === null) return
                  replace(index, { ...feature, count: Math.max(1, Math.round(n)) })
                }}
              />
              <FeatureNumber
                label="Length"
                unit="ft"
                value={feature.lengthFt}
                step={0.5}
                disabled={disabled}
                allowEmpty
                onCommit={(n) => replace(index, { ...feature, lengthFt: n })}
              />
              <FeatureNumber
                label="Width"
                unit="ft"
                value={feature.widthFt}
                step={0.5}
                disabled={disabled}
                allowEmpty
                onCommit={(n) => replace(index, { ...feature, widthFt: n })}
              />
            </div>
          </li>
        )
      })}
      {pending ? (
        <li className="px-4 py-1.5 text-formLabel text-theme-faint">Saving correction…</li>
      ) : null}
    </ul>
  )
}

function FeatureText({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: string
  disabled: boolean
  onCommit: (text: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => {
    setText(value)
  }, [value])

  return (
    <input
      type="text"
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim()
        if (next === '' || next === value) {
          setText(value)
          return
        }
        onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="w-full rounded-brand4 bg-transparent px-1 py-0.5 text-bodyS font-medium outline-none focus:bg-theme-bg focus:ring-2 focus:ring-family-accent disabled:opacity-50"
    />
  )
}

function FeatureNumber({
  label,
  unit,
  value,
  step,
  disabled,
  allowEmpty = false,
  onCommit,
}: {
  label: string
  unit?: string
  value: number | null
  step: number
  disabled: boolean
  allowEmpty?: boolean
  onCommit: (value: number | null) => void
}) {
  const asText = value === null ? '' : String(Math.round(value * 100) / 100)
  const [text, setText] = useState(asText)
  useEffect(() => {
    setText(asText)
  }, [asText])

  function commit() {
    if (text === asText) return
    const trimmed = text.trim()
    if (trimmed === '') {
      if (allowEmpty) onCommit(null)
      else setText(asText)
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n <= 0) {
      setText(asText)
      return
    }
    onCommit(n)
  }

  return (
    <label
      className={cn(
        'flex items-center gap-1 rounded-brand4 bg-theme-card px-1.5',
        'focus-within:bg-theme-bg focus-within:ring-2 focus-within:ring-family-accent',
      )}
    >
      <span className="font-brandMono text-formLabel uppercase tracking-wider text-theme-faint">
        {label}
      </span>
      <input
        type="number"
        step={step}
        aria-label={unit ? `${label} in ${unit}` : label}
        value={text}
        disabled={disabled}
        placeholder="Not read"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-full bg-transparent py-1 text-right text-bodyS tabular-nums outline-none disabled:opacity-50"
      />
      {unit ? <span className="font-brandMono text-formLabel text-theme-muted">{unit}</span> : null}
    </label>
  )
}
