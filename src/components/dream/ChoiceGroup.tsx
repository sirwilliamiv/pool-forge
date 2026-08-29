'use client'

// The controls. Swatches on a colour card, not a form.
//
// Everything a visitor changes goes through one of these three, and they are
// deliberately plain: the drawing is the thing worth looking at, and a control
// that competes with it makes the page harder to read and the pool harder to
// see. What each control does own is the answer to "what does this cost me",
// which is why every option can carry a price delta.

import type { ReactNode } from 'react'

interface Option {
  readonly id: string
  readonly label: string
  readonly blurb?: string
}

interface ChoiceGroupProps {
  readonly label: string
  readonly options: readonly Option[]
  readonly value: string
  readonly onChange: (id: string) => void
  /** Two columns for long lists, one for lists with long blurbs. */
  readonly columns?: 1 | 2
  /** What choosing this option does to the ballpark, already formatted. */
  readonly deltaFor?: (id: string) => string | null
}

export function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  columns = 1,
  deltaFor,
}: ChoiceGroupProps) {
  return (
    <Field label={label}>
      <div
        role="group"
        aria-label={label}
        className={columns === 2 ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}
      >
        {options.map((option) => {
          const selected = option.id === value
          const delta = deltaFor?.(option.id) ?? null
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className="dream-choice rounded-sm px-3 py-2.5"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium leading-tight">{option.label}</span>
                {delta !== null && (
                  <span className="dream-annotation shrink-0 text-[10px]" style={{ color: 'var(--pencil)' }}>
                    {delta}
                  </span>
                )}
              </span>
              {option.blurb && (
                <span
                  className="mt-1 block text-[11.5px] leading-snug"
                  style={{ color: 'var(--pencil)' }}
                >
                  {option.blurb}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

/**
 * A yes-or-no extra.
 *
 * Carries its price on the face of the control rather than revealing it after
 * the click. Hiding the number until somebody commits is how every other
 * configurator works and it is the thing that makes people distrust them.
 */
export function ToggleChoice({
  label,
  blurb,
  price,
  checked,
  onChange,
}: {
  label: string
  blurb: string
  price: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="dream-choice flex w-full items-start gap-3 rounded-sm px-3 py-2.5"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border"
        style={{
          borderColor: checked ? 'var(--graphite)' : 'var(--rule)',
          background: checked ? 'var(--graphite)' : '#fff',
        }}
      >
        {checked && (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
            <path d="M1 5 L4 8 L9 2" fill="none" stroke="#fff" strokeWidth="1.8" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium leading-tight">{label}</span>
          <span className="dream-annotation shrink-0 text-[10px]" style={{ color: 'var(--pencil)' }}>
            {price}
          </span>
        </span>
        <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: 'var(--pencil)' }}>
          {blurb}
        </span>
      </span>
    </button>
  )
}

/** How many of a thing. Two buttons and a figure, which is all it needs to be. */
export function CountChoice({
  label,
  blurb,
  price,
  value,
  max,
  onChange,
}: {
  label: string
  blurb: string
  price: string
  value: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="dream-choice rounded-sm px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium leading-tight">{label}</span>
        <span className="dream-annotation shrink-0 text-[10px]" style={{ color: 'var(--pencil)' }}>
          {price}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11.5px] leading-snug" style={{ color: 'var(--pencil)' }}>
          {blurb}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <StepButton label={`One fewer ${label.toLowerCase()}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
            &minus;
          </StepButton>
          <span
            className="dream-annotation w-6 text-center text-[13px]"
            aria-live="polite"
            aria-label={`${value} ${label.toLowerCase()}`}
          >
            {value}
          </span>
          <StepButton label={`One more ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
            +
          </StepButton>
        </span>
      </div>
    </div>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center border text-[14px] leading-none disabled:opacity-30"
      style={{ borderColor: 'var(--rule)', background: '#fff' }}
    >
      {children}
    </button>
  )
}

/** A labelled block on the sheet. The label is annotation, so it is set as one. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="dream-annotation mb-2 text-[10px]" style={{ color: 'var(--pencil)' }}>
        {label}
      </h2>
      {children}
    </section>
  )
}
