'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import type { VoiceSettings } from '@/modules/voice/settings'

// The one setting that decides how much the agent may do unattended.
//
// It is a real choice a builder makes once they trust it, and it is theirs
// rather than the agent's: `settings.voice.set` carries no voice examples, so
// the converter refuses it and the assistant is never offered a way to switch
// off its own gate.

export function VoiceSettingsForm({ initial }: { initial: VoiceSettings }) {
  const [confirmDestructive, setConfirmDestructive] = useState(initial.confirmDestructive)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    const previous = confirmDestructive
    setConfirmDestructive(next)
    startTransition(async () => {
      const result = await dispatch('settings.voice.set', { confirmDestructive: next })
      if (!result.ok) {
        // Put the switch back. A toggle that stays where it was clicked while
        // the save failed is a setting the user believes is on and is not.
        setConfirmDestructive(previous)
        toast.error(result.error)
        return
      }
      toast.success(next ? 'Voice will ask before removing anything.' : 'Voice will not ask first.')
    })
  }

  return (
    <label className="flex items-start gap-3 rounded-brand16 border border-theme-line bg-theme-bg p-4">
      <input
        type="checkbox"
        checked={confirmDestructive}
        disabled={pending}
        onChange={event => change(event.target.checked)}
        className="mt-0.5 accent-[color:var(--theme-fg)]"
      />
      <span>
        <span className="text-bodyL font-medium text-theme-fg">
          Ask before voice removes anything
        </span>
        <span className="mt-1 block text-bodyS leading-relaxed text-theme-muted">
          A dialog naming exactly what will be lost, which you have to accept. On by default,
          because a spoken confirmation is the assistant deciding you agreed from audio it may have
          misheard. With this off, voice deletes on a spoken yes alone.
        </span>
      </span>
    </label>
  )
}
