'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Circle, X } from 'lucide-react'
import { toast } from 'sonner'
import { dispatch } from '@/lib/commands/dispatch'
import type { FirstRunStep } from '@/modules/onboarding/first-run'

// Quiet on purpose.
//
// This is a professional tool. A builder who has just signed up does not want a
// product tour, a spotlight, a modal or a confetti burst; they want to know the
// two or three facts that would otherwise embarrass them in front of a
// customer. So: one bordered card at the top of the projects page, three lines,
// a link on each, and a close button that means it.
//
// Nothing here blocks the page, nothing steals focus, and every step links to
// the screen that finishes it rather than explaining how.

export function FirstRunChecklist({ steps }: { steps: readonly FirstRunStep[] }) {
  const [hidden, setHidden] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  if (hidden) return null

  const remaining = steps.filter((step) => !step.done).length

  function onDismiss() {
    // Gone from this page immediately; the write and the refresh follow. A
    // close button that waits on a round trip reads as broken.
    setHidden(true)
    startTransition(async () => {
      const res = await dispatch('settings.firstRun.dismiss', {})
      if (!res.ok) {
        setHidden(false)
        toast.error(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section
      aria-label="Setup checklist"
      className="rounded-lg border bg-muted/30 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Before your first proposal</h2>
          <p className="text-xs text-muted-foreground">
            {remaining === 1
              ? 'One thing left. Everything on a new account starts empty.'
              : `${remaining} things left. Everything on a new account starts empty.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={pending}
          aria-label="Dismiss setup checklist"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5 text-sm">
            {step.done ? (
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
            <div className="min-w-0">
              <span className={step.done ? 'text-muted-foreground line-through' : 'font-medium'}>
                {step.title}
              </span>
              <p className="text-xs text-muted-foreground">
                {step.detail}{' '}
                {step.done ? null : (
                  <Link href={step.href} className="font-medium underline underline-offset-2">
                    {step.cta}
                  </Link>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
