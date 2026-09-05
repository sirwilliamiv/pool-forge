'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2, User, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { DrawingSvg } from '@/components/exports/DrawingSvg'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import type { Shape } from '@/modules/editor/state/shapes'
import { loadVersionShapes } from '@/modules/versions/shapes-action'

export interface RackVersion {
  id: string
  name: string
  note: string | null
  source: 'BUILDER' | 'CUSTOMER'
  authorName: string | null
  totalCents: number | null
  isActive: boolean
  createdAt: string
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

  // The drawing behind each card, fetched as the rack scrolls to it rather
  // than shipped for all forty on first paint. A value of `undefined` means
  // "not fetched yet" (show a skeleton); an array (possibly empty) means the
  // fetch resolved.
  const [shapesById, setShapesById] = useState<Record<string, Shape[]>>({})
  const requested = useRef<Set<string>>(new Set())

  const ensureShapes = useCallback(
    (versionId: string) => {
      if (requested.current.has(versionId)) return
      requested.current.add(versionId)
      void loadVersionShapes(projectId, versionId)
        .then(shapes => setShapesById(prev => ({ ...prev, [versionId]: shapes })))
        .catch(() => {
          // Let a failed fetch be retried the next time the card comes round.
          requested.current.delete(versionId)
        })
    },
    [projectId],
  )

  // Follow the open design when the set changes, so opening one from elsewhere
  // does not leave the rack pointing at a card nobody is looking at.
  useEffect(() => {
    const active = versions.findIndex(version => version.isActive)
    setIndex(active >= 0 ? active : 0)
  }, [versions])

  // Fetch the drawings for the cards within the visible spread of the centre,
  // and prefetch one past the edge so a scroll does not flash a skeleton.
  useEffect(() => {
    for (let i = index - VISIBLE_SPREAD - 1; i <= index + VISIBLE_SPREAD + 1; i += 1) {
      const version = versions[i]
      if (version) ensureShapes(version.id)
    }
  }, [index, versions, ensureShapes])

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

  async function rename(versionId: string, currentName: string) {
    const next = window.prompt('Rename this design', currentName)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === currentName) return
    setBusy(true)
    const result = await dispatch('version.rename', { versionId, name: trimmed })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Renamed to ${trimmed}.`)
    onOpened?.(versionId)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={railRef}
        tabIndex={0}
        role="listbox"
        aria-label="Saved designs"
        className="relative h-[340px] overflow-hidden rounded-pfMd bg-gradient-to-b from-rowHover to-white focus:outline-none focus:ring-2 focus:ring-pfAccent"
        // A near viewpoint is what makes the turn read as a turn. At 1600px the
        // cards were rotated and looked merely small: the perspective was so
        // shallow that a 50 degree turn foreshortened by almost nothing.
        style={{ perspective: '900px', perspectiveOrigin: '50% 45%' }}
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
              className="absolute left-1/2 top-1/2 h-[268px] w-[336px] origin-center rounded-pfSm border border-border bg-white shadow-pfLg transition-all duration-300 ease-out"
              style={{
                // Turned hard, and pushed back as well as sideways: without
                // the Z the far cards sit in the same plane as the near ones and
                // the rack reads as overlapping rectangles rather than depth.
                transform: [
                  'translate(-50%, -50%)',
                  `translateX(${offset * 118 + Math.sign(offset) * 96}px)`,
                  `translateZ(${centred ? 0 : -90 - distance * 40}px)`,
                  `rotateY(${centred ? 0 : offset > 0 ? -64 : 64}deg)`,
                ].join(' '),
                zIndex: 100 - distance,
                // Depth by shading rather than by opacity. A translucent card
                // lets the cards behind it show through its own drawing, so a
                // rack of four designs read as one muddy overlay of all of
                // them. Dimming keeps every card opaque and still says which
                // one is nearest.
                filter: centred ? 'none' : `brightness(${1 - distance * 0.06})`,
                backfaceVisibility: 'hidden',
              }}
            >
              <div className="pointer-events-none flex h-full flex-col">
                <div className="flex-1 overflow-hidden rounded-t-pfSm bg-white">
                  {shapesById[version.id] ? (
                    <DrawingSvg
                      shapes={shapesById[version.id] ?? []}
                      widthPx={336}
                      heightPx={212}
                      showLabels={false}
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-rowHover" aria-hidden />
                  )}
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
              onClick={() => void rename(current.id, current.name)}
              disabled={busy}
              title={`Rename ${current.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-pfSm text-textMuted transition-colors hover:bg-rowHover hover:text-foreground disabled:opacity-60"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              <span className="sr-only">Rename this design</span>
            </button>
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
