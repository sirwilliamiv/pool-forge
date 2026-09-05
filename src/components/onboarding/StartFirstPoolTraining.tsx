'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { FIRST_POOL_TRAINING, TRAINING_PARAM } from '@/components/editor/training/FirstPoolTraining'

/** Name convention that marks the disposable project the training builds in. */
const SANDBOX_NAME = 'Training · practice pool'

/**
 * One click: create a throwaway project and open its editor in training mode,
 * where {@link FirstPoolTraining} takes over and builds a pool step by step.
 * The project is real (so every command runs normally) but disposable — the
 * training offers to discard it at the end.
 */
export function StartFirstPoolTraining({ className, label = 'Watch Marco build a pool' }: {
  className?: string
  label?: string
}) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  async function start() {
    if (starting) return
    setStarting(true)
    const res = await dispatch<{ name: string }, { projectId: string }>('create.project', {
      name: SANDBOX_NAME,
    })
    if (!res.ok) {
      setStarting(false)
      toast.error(res.error)
      return
    }
    router.push(`/projects/${res.data.projectId}/editor?${TRAINING_PARAM}=${FIRST_POOL_TRAINING}`)
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={starting}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60'
      }
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      {starting ? 'Setting up…' : label}
    </button>
  )
}
