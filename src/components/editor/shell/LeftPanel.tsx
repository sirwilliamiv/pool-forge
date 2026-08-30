'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { useViewStore, type LeftTab, type ViewMode } from '@/modules/editor/state/viewStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { LayersTree } from './layers/LayersTree'
import { StencilGrid } from './stencils/StencilGrid'
import { GradePanel } from './GradePanel'
import { SitePanel } from './SitePanel'
import { MaterialGrid } from './materials/MaterialGrid'
import { focusRing, useFocusFlash } from './useFocusFlash'

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'layers', label: 'Layers' },
  { id: 'stencils', label: 'Stencils' },
  { id: 'materials', label: 'Materials' },
  { id: 'site', label: 'Site' },
  { id: 'grade', label: 'Grade' },
]

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: '3d', label: '3D' },
  { id: 'section', label: 'Section' },
]

export function LeftPanel() {
  const leftTab = useViewStore((s) => s.leftTab)
  const setLeftTab = useViewStore((s) => s.setLeftTab)
  const viewMode = useViewStore((s) => s.viewMode)
  const setViewMode = useViewStore((s) => s.setViewMode)
  const [search, setSearch] = useState('')
  const flashing = useFocusFlash(leftTab)

  return (
    <aside
      className={`flex h-full min-h-0 w-[248px] flex-col overflow-hidden border-r border-borderLight bg-white transition-shadow ${focusRing(flashing)}`}
      data-guide-scope="left-panel"
    >
      {/* gap-2 and a slightly smaller face: a fifth tab (Site) pushed "Grade"
          off the 248px panel, and a clipped tab is a feature nobody finds. */}
      <div className="flex items-center gap-2 border-b border-borderLight px-2">
        {TABS.map((tab) => {
          const active = tab.id === leftTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLeftTab(tab.id)}
              className={
                'relative h-9 whitespace-nowrap text-[11.5px] font-medium ' +
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
      </div>

      <div className="px-3 py-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-textFaint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              leftTab === 'stencils'
                ? 'Search stencils…'
                : leftTab === 'materials'
                  ? 'Search materials…'
                  : 'Search this design…'
            }
            className="h-7 w-full rounded-pfSm bg-rowHover pl-7 pr-2 text-[11.5px] text-foreground placeholder:text-textFaint focus:bg-white focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {leftTab === 'layers' ? <LayersTab /> : null}
        {leftTab === 'stencils' ? <StencilGrid search={search} /> : null}
        {leftTab === 'materials' ? <MaterialGrid searchQuery={search} /> : null}
        {leftTab === 'site' ? <SitePanel /> : null}
        {leftTab === 'grade' ? <GradePanel /> : null}
      </div>

      <div className="border-t border-borderLight px-3 py-2">
        <div role="tablist" className="flex h-7 items-center rounded-pfSm bg-rowHover p-0.5 text-[11px] font-medium">
          {VIEW_MODES.map((mode) => {
            const active = mode.id === viewMode
            return (
              <button
                key={mode.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={
                  'flex-1 rounded-[5px] py-0.5 transition-colors ' +
                  (active ? 'bg-white text-foreground shadow-pfXs' : 'text-textMuted hover:text-foreground')
                }
              >
                {mode.label}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
      <span>
        {label}
        {typeof count === 'number' ? <span className="ml-1 text-textFaint">{count}</span> : null}
      </span>
      <button
        type="button"
        aria-label={`Add ${label}`}
        className="grid h-4 w-4 place-items-center rounded-pfXs text-textFaint hover:bg-rowHover hover:text-foreground"
      >
        +
      </button>
    </div>
  )
}

function LayersTab() {
  const layerCount = useShapesStore((s) => s.shapes.length)
  return (
    <div className="pb-3">
      <SectionHeader label="Sheets" count={1} />
      <ul className="px-1 text-[12px]">
        <li className="flex h-6 items-center gap-2 rounded-pfXs px-2 text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-pfAccent" aria-hidden />
          <span className="flex-1">Site &amp; pool plan</span>
          <span className="text-[10px] uppercase tracking-[0.5px] text-textFaint">active</span>
        </li>
      </ul>

      <SectionHeader label="Layers" count={layerCount} />
      <LayersTree />
    </div>
  )
}

