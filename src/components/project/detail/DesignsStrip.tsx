'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DrawingSvg } from '@/components/exports/DrawingSvg'
import type { RackVersion } from '@/components/versions/VersionRack'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'

function money(cents: number | null): string {
  if (cents === null) return 'Not priced'
  return `$${Math.round(cents / 100).toLocaleString()}`
}

/**
 * The designs on a job as a compact horizontal strip: a large "Open editor"
 * tile first (the drawing is the product; the door to it leads the row), then
 * every saved version as a live-rendered thumbnail. The D3 presentation.
 */
export function DesignsStrip({
  projectId,
  versions,
}: {
  projectId: string
  versions: RackVersion[]
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function saveCurrent() {
    const name = window.prompt('What is this design called?', `Design ${versions.length + 1}`)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('A design needs a name, so it can be told apart from the others.')
      return
    }
    setBusy(true)
    const result = await dispatch('version.save', { projectId, name: trimmed })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Saved ${trimmed}.`)
    router.refresh()
  }

  async function open(versionId: string) {
    setBusy(true)
    const result = await dispatch('version.open', { projectId, versionId })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  async function remove(versionId: string, name: string) {
    if (!window.confirm(`Delete the design “${name}”? The drawing it was saved from is unaffected.`)) return
    setBusy(true)
    const result = await dispatch('version.delete', { versionId })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  return (
    <section id="designs" aria-label="Designs" className="scroll-mt-24">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-brandMono text-badge uppercase text-theme-muted">Designs</h2>
        <button
          type="button"
          onClick={() => void saveCurrent()}
          disabled={busy}
          className="flex items-center gap-1.5 text-bodyS text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Save current drawing
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        <Link
          href={`/projects/${projectId}/editor`}
          className="flex h-36 w-44 shrink-0 flex-col items-center justify-center gap-2 rounded-brand border border-theme-line bg-theme-card text-theme-fg transition-colors duration-brand ease-brand hover:bg-theme-field"
        >
          <ExternalLink className="h-5 w-5" aria-hidden />
          <span className="text-bodyL font-medium">Open editor</span>
          <span className="text-bodyS text-theme-muted">Draw the pool</span>
        </Link>
        {versions.map((version) => (
          <div
            key={version.id}
            className={cn(
              'group relative h-36 w-44 shrink-0 overflow-hidden rounded-brand border bg-theme-bg text-left',
              version.isActive ? 'border-theme-fg' : 'border-theme-line',
            )}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => void open(version.id)}
              className="block h-full w-full text-left"
              title={version.isActive ? `${version.name} (open)` : `Open ${version.name}`}
            >
              <div className="flex h-[92px] items-center justify-center overflow-hidden bg-theme-field [&_svg]:h-full [&_svg]:w-full">
                <DrawingSvg shapes={version.shapes} widthPx={176} heightPx={92} showLabels={false} />
              </div>
              <div className="space-y-0.5 px-2.5 py-1.5">
                <p className="flex items-center gap-1 truncate text-bodyS font-medium text-theme-fg">
                  {version.isActive ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
                  {version.name}
                </p>
                <p className="font-brandMono text-badge text-theme-muted">{money(version.totalCents)}</p>
              </div>
            </button>
            <button
              type="button"
              aria-label={`Delete ${version.name}`}
              onClick={() => void remove(version.id, version.name)}
              className="absolute right-1.5 top-1.5 hidden rounded-brand border border-theme-line bg-theme-bg p-1 text-theme-muted hover:text-brand-red group-hover:block"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ))}
        {versions.length === 0 ? (
          <div className="flex h-36 items-center px-4 text-bodyS text-theme-muted">
            No saved designs yet. Save the drawing as a design and every version you try will line
            up here.
          </div>
        ) : null}
      </div>
    </section>
  )
}
