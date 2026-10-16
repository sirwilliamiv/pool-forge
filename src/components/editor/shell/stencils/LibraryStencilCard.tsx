'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { dispatch } from '@/lib/commands/dispatch'
import { INCHES_PER_FOOT } from '@/lib/three/units'
import { StencilDragSource, encodeStencilDrag } from '@/modules/editor/interactions/stencil-drag'
import { stagedCount, stagingPlacement } from '@/modules/editor/placement'
import { useLibraryStore } from '@/modules/editor/state/libraryStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import {
  LibraryCommand,
  type DeleteInput,
  type DeleteOutput,
  type OrgStencilSummary,
  type PlaceInput,
  type PlaceOutput,
} from '@/modules/imports/visio/types'

/** Longest side of the preview box, in px. Matches the catalogue card. */
const PREVIEW = 46

/** An SVG string as an `<img>` source. */
export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function feetText(inches: number): string {
  const ft = Math.round((inches / INCHES_PER_FOOT) * 10) / 10
  return Number.isInteger(ft) ? String(ft) : ft.toFixed(1)
}

/** Real inches as the panel writes a size: `25' × 12'`. */
export function dimensionLabel(widthIn: number, heightIn: number): string {
  return `${feetText(widthIn)}' × ${feetText(heightIn)}'`
}

interface Props {
  stencil: OrgStencilSummary
}

export function LibraryStencilCard({ stencil }: Props) {
  // The remove control exists only while the card is pointed at or focused, so
  // the card itself is the one thing a reader or a test finds by the name.
  const [active, setActive] = useState(false)
  const dimLabel = dimensionLabel(stencil.widthIn, stencil.heightIn)

  const place = async () => {
    const shapes = useShapesStore.getState().shapes
    const { x, y } = stagingPlacement(shapes, stencil.id, stagedCount(shapes))
    const result = await dispatch<PlaceInput, PlaceOutput>(LibraryCommand.PLACE, {
      orgStencilId: stencil.id,
      x,
      y,
    })
    if (!result.ok) toast.error(result.error)
  }

  // Two clicks, not a browser confirm dialog. The first turns the control into
  // the question; the second answers it. Leaving the card withdraws the
  // question, so a stray hover cannot delete anything.
  const [confirming, setConfirming] = useState(false)

  const removeFromLibrary = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const result = await dispatch<DeleteInput, DeleteOutput>(LibraryCommand.DELETE, {
      orgStencilId: stencil.id,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    useLibraryStore.getState().remove(stencil.id)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { setActive(false); setConfirming(false) }}
      onFocus={() => setActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setActive(false); setConfirming(false) }
      }}
    >
      <button
        type="button"
        draggable
        onClick={() => void place()}
        onDragStart={(e) =>
          encodeStencilDrag(e.dataTransfer, {
            source: StencilDragSource.LIBRARY,
            id: stencil.id,
            widthIn: stencil.widthIn,
            heightIn: stencil.heightIn,
          })
        }
        title={`${stencil.name} (${dimLabel})`}
        className="group flex w-full items-center gap-2 rounded-pfSm p-1.5 pr-7 text-left hover:bg-rowHover focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
      >
        <span
          className="flex shrink-0 items-center justify-center rounded-pfXs bg-rowHover p-1"
          style={{ width: PREVIEW + 8, height: PREVIEW + 8 }}
          aria-hidden
        >
          {/* An inline SVG data URL: nothing for next/image to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={svgDataUrl(stencil.thumbnailSvg)} className="max-h-full max-w-full" draggable={false} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium leading-tight text-foreground">{stencil.name}</span>
          <span className="mt-0.5 block text-[10px] leading-tight text-textFaint tabular-nums">{dimLabel}</span>
        </span>
      </button>
      {active ? (
        <button
          type="button"
          aria-label={`Remove ${stencil.name} from library`}
          onClick={() => void removeFromLibrary()}
          title={confirming ? 'Click again to remove. Shapes already drawn stay.' : 'Remove from library'}
          className={
            'absolute right-1.5 top-1/2 flex h-5 -translate-y-1/2 items-center justify-center rounded-pfXs text-[10px] font-medium focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent ' +
            (confirming
              ? 'w-auto px-1.5 bg-foreground text-white'
              : 'w-5 text-textFaint hover:bg-rowHover hover:text-foreground')
          }
        >
          {confirming ? 'Remove?' : <X className="h-3 w-3" aria-hidden />}
        </button>
      ) : null}
    </div>
  )
}
