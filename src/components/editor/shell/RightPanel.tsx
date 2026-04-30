'use client'

import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { useViewStore, type RightTab } from '@/modules/editor/state/viewStore'

export interface RightPanelProps {
  selectionCardSlot?: ReactNode
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
  positionSlot,
  geometrySlot,
  materialSlot,
  computedMetricsSlot,
  quoteContributionSlot,
}: RightPanelProps) {
  const rightTab = useViewStore((s) => s.rightTab)
  const setRightTab = useViewStore((s) => s.setRightTab)

  return (
    <aside className="flex h-full min-h-0 w-[296px] flex-col overflow-hidden border-l border-borderLight bg-white">
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
        <button
          type="button"
          aria-label="Comments"
          className="grid h-7 w-7 place-items-center rounded-pfSm text-textMuted hover:bg-rowHover hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rightTab === 'design' ? (
          <div className="flex flex-col">
            <Slot label="Selection card" node={selectionCardSlot} hero />
            <Slot label="Position" node={positionSlot} />
            <Slot label="Geometry" node={geometrySlot} />
            <Slot label="Material / Finish" node={materialSlot} />
            <Slot label="Computed metrics" node={computedMetricsSlot} />
            <Slot label="Quote contribution" node={quoteContributionSlot} />
          </div>
        ) : null}
        {rightTab === 'specs' ? (
          <p className="px-3 py-4 text-[11.5px] text-textFaint">Specs pane — Wave 1 follow-on.</p>
        ) : null}
        {rightTab === 'quote' ? (
          <p className="px-3 py-4 text-[11.5px] text-textFaint">Quote pane — Wave 1 follow-on.</p>
        ) : null}
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
