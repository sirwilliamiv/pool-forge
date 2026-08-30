'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { VersionRack, type RackVersion } from './VersionRack'

interface Props {
  projectId: string
  versions: RackVersion[]
}

/**
 * The designs on a job, with the control that adds one.
 *
 * A card on the project page rather than a screen of its own, because choosing
 * between designs is something a builder does while looking at the rest of the
 * job: the customer, the status, the price. Sending them somewhere else to
 * compare would mean sending them away from everything the comparison is about.
 */
export function VersionsCard({ projectId, versions }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function saveCurrent() {
    const name = window.prompt(
      'What is this design called?',
      `Design ${versions.length + 1}`,
    )
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('A design needs a name, so it can be told apart from the others.')
      return
    }

    setSaving(true)
    const result = await dispatch('version.save', { projectId, name: trimmed })
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Saved ${trimmed}.`)
    router.refresh()
  }

  return (
    <section className="rounded-lg border bg-card p-5" data-guide-scope="versions">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            Designs
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Every version tried on this job. Open one to load it into the editor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveCurrent()}
          disabled={saving}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Save current drawing
        </button>
      </header>

      <VersionRack
        projectId={projectId}
        versions={versions}
        onOpened={() => router.refresh()}
      />
    </section>
  )
}
