'use client'

import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { dispatchEphemeral } from '@/lib/commands/dispatch'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { unresolvedCount } from '@/modules/editor/comments/model'
import { useViewStore, type RightTab } from '@/modules/editor/state/viewStore'
import { CommentsPanel } from './CommentsPanel'
import { SpecsTab } from './inspector/SpecsTab'
import { QuoteTab } from './inspector/QuoteTab'
import { focusRing, useFocusFlash } from './useFocusFlash'

export interface RightPanelProps {
  selectionCardSlot?: ReactNode
  /** Only rendered for a drawn path: what it is, and what it can become. */
  sketchSlot?: ReactNode
  positionSlot?: ReactNode
  geometrySlot?: ReactNode
  materialSlot?: ReactNode
  computedMetricsSlot?: ReactNode
  quoteContributionSlot?: ReactNode
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'specs', label: 'Specs' },
  { id: 'quote', label: 'Quote' },
]

export function RightPanel({
  selectionCardSlot,
  sketchSlot,
  positionSlot,
  geometrySlot,
  materialSlot,
  computedMetricsSlot,
  quoteContributionSlot,
}: RightPanelProps) {
  const rightTab = useViewStore((s) => s.rightTab)
  const setRightTab = useViewStore((s) => s.setRightTab)
  const openNotes = useCommentsStore((s) => unresolvedCount(s.comments))
  const flashing = useFocusFlash(rightTab)

  return (
    <aside
      className={`flex h-full min-h-0 w-[296px] flex-col overflow-hidden border-l border-borderLight bg-white transition-shadow ${focusRing(flashing)}`}
    >
      <div className="flex items-center gap-3 border-b border-borderLight px-3">
        {TABS.map((tab) => {
          const active = tab.id === rightTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRightTab(tab.id)}
              className={
                'relative h-9 text-[12px] font-medium ' +
                (active ? 'text-foreground' : 'text-textMuted hover:text-foreground')
              }
            >
              {tab.label}
              {active ? (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-foreground" aria-hidden />
              ) : null}
            </button>
          )
        })}
        <div className="flex-1" />
        {/* A fourth tab wearing an icon, not a button that does nothing. It was
            the second of three "coming soon" controls in the editor chrome, and
            a walkthrough had to tell the user to ignore it. */}
        <button
          type="button"
          onClick={() =>
            // Through the registry, like every other action: the tab this opens
            // is also reachable by voice and by the palette, and all three write
            // the same audit row. Ephemeral so the panel switches on the click
            // rather than after a round trip.
            dispatchEphemeral('nav.focus', { target: rightTab === 'comments' ? 'design' : 'comments' })
          }
          aria-label="Notes"
          title="Notes on this drawing"
          aria-pressed={rightTab === 'comments'}
          className={
            'relative grid h-7 w-7 place-items-center rounded-pfSm ' +
            (rightTab === 'comments'
              ? 'bg-rowHover text-foreground'
              : 'text-textMuted hover:bg-rowHover hover:text-foreground')
          }
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {openNotes > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-amber-500 px-[3px] text-[8.5px] font-semibold leading-none text-white">
              {openNotes}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rightTab === 'design' ? (
          <div className="flex flex-col">
            <Slot label="Selection card" node={selectionCardSlot} hero />
            {sketchSlot}
            <Slot label="Position" node={positionSlot} />
            <Slot label="Geometry" node={geometrySlot} />
            <Slot label="Material / Finish" node={materialSlot} />
            <Slot label="Computed metrics" node={computedMetricsSlot} />
            <Slot label="Quote contribution" node={quoteContributionSlot} />
          </div>
        ) : null}
        {rightTab === 'specs' ? <SpecsTab /> : null}
        {rightTab === 'quote' ? <QuoteTab /> : null}
        {rightTab === 'comments' ? <CommentsPanel /> : null}
      </div>
    </aside>
  )
}

function Slot({ label, node, hero }: { label: string; node: ReactNode; hero?: boolean }) {
  if (node) {
    return <div className="border-b border-borderLight last:border-b-0">{node}</div>
  }
  return (
    <div
      className={
        'border-b border-borderLight px-3 py-3 last:border-b-0 ' +
        (hero ? 'bg-gradient-to-b from-pfAccentSoft to-white' : '')
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">{label}</div>
      <div className="mt-1 text-[11.5px] text-textFaint">Track E pending.</div>
    </div>
  )
}
