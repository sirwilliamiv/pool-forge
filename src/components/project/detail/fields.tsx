'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * A labelled text input, which is the only way the detail page makes one.
 *
 * Carried over from the old ProjectForm for the same reason it existed there:
 * taking the id as a required prop and wiring the label here means a new field
 * cannot be added without an accessible name, an `id`, and a `name`.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  type,
  autoComplete,
  placeholder,
  required,
  disabled,
  describedBy,
  full,
  list,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: (() => void) | undefined
  type?: string | undefined
  autoComplete?: string | undefined
  placeholder?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  describedBy?: string | undefined
  full?: boolean | undefined
  list?: string | undefined
}) {
  return (
    <div className={`space-y-2 ${full ? 'md:col-span-2' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        list={list}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  )
}

/**
 * A person field backed by the team roster.
 *
 * A datalist rather than a Select: the stored column is a name, existing
 * projects hold names that may not be on the roster any more, and a builder
 * quoting with a subcontractor should not be blocked from typing one. The
 * roster is the suggestion, not the law.
 */
export function TeamMemberField({
  id,
  label,
  value,
  onChange,
  memberNames,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  memberNames: string[]
}) {
  const listId = `${id}-team-list`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {memberNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}

/**
 * A priced selection with its spec underneath.
 *
 * The spec collapses entirely when the option is off, rather than sitting
 * greyed out with helper text: an unticked heater has no model, and a dead
 * input explaining why it is dead is a row of noise on every project that
 * doesn't buy one.
 */
export function Option({
  id,
  label,
  checked,
  onChange,
  detailId,
  detailLabel,
  detailPlaceholder,
  detailValue,
  onDetailChange,
  checkbox,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  detailId: string
  detailLabel: string
  detailPlaceholder: string
  detailValue: string
  onDetailChange: (value: string) => void
  /** The rendered checkbox control, so this file stays free of Radix imports. */
  checkbox: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {checkbox}
        <Label htmlFor={id} className="font-display normal-case tracking-normal text-bodyL text-theme-fg">
          {label}
        </Label>
      </div>
      {checked ? (
        <Detail
          id={detailId}
          label={detailLabel}
          placeholder={detailPlaceholder}
          value={detailValue}
          onChange={onDetailChange}
        />
      ) : null}
    </div>
  )
}

/** The subordinate half: indented and quieter. Rendered only while its parent is on. */
export function Detail({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const hintId = `${id}-hint`
  return (
    <div className="ml-6 max-w-md space-y-1.5 border-l border-theme-line pl-4">
      <Label htmlFor={id} className="text-theme-faint">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        className="h-9"
        placeholder={placeholder}
        value={value}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={hintId} className="text-bodyS text-theme-muted">
        Printed on the spec sheet. It does not change the price.
      </p>
    </div>
  )
}
