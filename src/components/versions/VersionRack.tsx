'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, User, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { DrawingSvg } from '@/components/exports/DrawingSvg'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import type { Shape } from '@/modules/editor/state/shapes'

export interface RackVersion {
  id: string
  name: string
  note: string | null
  source: 'BUILDER' | 'CUSTOMER'
  authorName: string | null
  totalCents: number | null
  isActive: boolean
  createdAt: string
  shapes: Shape[]
}

interface Props {
  projectId: string
  versions: RackVersion[]
  onOpened?: (versionId: string) => void
}

/** How far from the centre a card is still worth drawing, in cards. */
const VISIBLE_SPREAD = 4

function money(cents: number | null): string {
  if (cents === null) return 'Not priced'
  return `$${Math.round(cents / 100).toLocaleString()}`
}

/**
 * The designs on a job, as a rack you slide through.
 *
 * Turned rather than tiled, because a job can hold a lot of these and a grid of
 * forty thumbnails is a filing cabinet rather than a comparison. The centre card
 * faces you and the rest angle away, so the whole set stays on screen and the
 * one being considered is unmistakable.
 *
 * Cards render the drawing itself rather than a stored thumbnail. The drawing is
 * already SVG for every export, so a card is always what the design actually is:
 * nothing to regenerate, and no version whose picture is a design somebody
 * changed a week ago.
 */
export function VersionRack({ projectId, versions, onOpened }: Props) {
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)

  // Follow the open design when the set changes, so opening one from elsewhere
  // does not leave the rack pointing at a card nobody is looking at.
  useEffect(() => {
    const active = versions.findIndex(version => version.isActive)
    setIndex(active >= 0 ? active : 0)
  }, [versions])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') setIndex(i => Math.min(versions.length - 1, i + 1))
      if (event.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
    }
    const rail = railRef.current
    rail?.addEventListener('keydown', onKey)
    return () => rail?.removeEventListener('keydown', onKey)
  }, [versions.length])

  if (versions.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-textMuted">
        No saved designs yet. Save the drawing as a design and every version you try will line up
        here.
      </p>
    )
  }

  const current = versions[index]

  async function open(versionId: string) {
    setBusy(true)
    const result = await dispatch('version.open', { projectId, versionId })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onOpened?.(versionId)
  }

  async function remove(versionId: string) {
    setBusy(true)
    const result = await dispatch('version.delete', { versionId })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onOpened?.(versionId)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={railRef}
        tabIndex={0}
        role="listbox"
        aria-label="Saved designs"
        className="relative h-[300px] overflow-hidden rounded-pfMd bg-rowHover focus:outline-none focus:ring-2 focus:ring-pfAccent"
        style={{ perspective: '1600px' }}
      >
        {versions.map((version, i) => {
          const offset = i - index
          const distance = Math.abs(offset)
          if (distance > VISIBLE_SPREAD) return null
          const centred = offset === 0
          return (
            <button
              key={version.id}
              type="button"
              role="option"
              aria-selected={centred}
              onClick={() => (centred ? void open(version.id) : setIndex(i))}
              disabled={busy}
              title={centred ? `Open ${version.name}` : version.name}
              className="absolute left-1/2 top-1/2 h-[240px] w-[300px] rounded-pfSm border border-border bg-white shadow-pfLg transition-all duration-300 ease-out"
              style={{
                // Turned away as cards get further from the centre, and
                // overlapped rather than spaced, so twenty designs occupy the
                // same rail as three.
                transform: `translate(-50%, -50%) translateX(${offset * 92}px) rotateY(${
                  centred ? 0 : offset > 0 ? -52 : 52
                }deg) scale(${centred ? 1 : 0.88})`,
                zIndex: 100 - distance,
                opacity: centred ? 1 : Math.max(0.35, 1 - distance * 0.22),
              }}
            >
              <div className="pointer-events-none flex h-full flex-col">
                <div className="flex-1 overflow-hidden rounded-t-pfSm bg-white">
                  <DrawingSvg
                    shapes={version.shapes}
                    widthPx={300}
                    heightPx={190}
                    showLabels={false}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-borderLight px-2.5 py-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {version.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-textMuted">
                    {money(version.totalCents)}
                  </span>
                </div>
              </div>
              {version.isActive ? (
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-white">
                  <Check className="h-3 w-3" aria-hidden />
                  Open
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {current ? (
        <div className="flex items-start justify-between gap-4 px-1">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              {current.source === 'CUSTOMER' ? (
                <User className="h-3.5 w-3.5 text-pfAccent" aria-hidden />
              ) : (
                <Wrench className="h-3.5 w-3.5 text-textMuted" aria-hidden />
              )}
              {current.name}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] text-textMuted">
              {current.source === 'CUSTOMER' ? 'Drawn by the customer' : 'Drawn in house'}
              {current.authorName ? ` · ${current.authorName}` : ''}
              {current.note ? ` · ${current.note}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {current.isActive ? null : (
              <button
                type="button"
                onClick={() => void open(current.id)}
                disabled={busy}
                className="rounded-pfSm bg-foreground px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-foreground/90 disabled:opacity-60"
              >
                Open this design
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove(current.id)}
              disabled={busy || current.isActive}
              title={
                current.isActive
                  ? 'This design is open. Open another before deleting it.'
                  : `Delete ${current.name}`
              }
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-pfSm transition-colors',
                current.isActive
                  ? 'cursor-not-allowed text-textFaint'
                  : 'text-textMuted hover:bg-rowHover hover:text-foreground',
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              <span className="sr-only">Delete this design</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
