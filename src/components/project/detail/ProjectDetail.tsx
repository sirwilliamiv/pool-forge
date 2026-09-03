'use client'

import * as React from 'react'
import { ExportCommandHandlers } from '@/components/exports/ExportCommandHandlers'
import { ProjectLineItems } from '@/components/project/ProjectLineItems'
import { VersionsCard } from '@/components/versions/VersionsCard'
import { cn } from '@/lib/utils'
import { computeDocPrereqs, DocumentsCard } from './DocumentsControls'
import { FocusedAddress } from './FocusedAddress'
import {
  EquipmentSection,
  PoolSection,
  ProjectSection,
  SiteCustomerSection,
} from './FormSections'
import { ProjectHeader, QuoteProvider } from './ProjectHeader'
import { useProjectSave } from './useProjectSave'
import type { ProjectDetailData } from './types'

/**
 * The project page: address-first, workflow-ordered, saveless.
 *
 * A project with no site address opens in the focused "Where is this pool
 * going?" state; picking an address (or skipping) expands into the full page
 * without a reload. The sticky header carries the page's state; the sections
 * below run in the order the work happens: site & customer, project, designs,
 * pool, equipment, hand-entered amounts, documents.
 */
export function ProjectDetail({ data }: { data: ProjectDetailData }) {
  const save = useProjectSave(data.projectId, data.initial)
  const skipKey = `pf.project.${data.projectId}.address-skipped`
  const [focused, setFocused] = React.useState(data.initial.siteAddress.trim() === '')

  // A project with no address opens focused, but only until the user skips.
  // Remembering that per project means a reload does not shove someone who
  // chose to fill the rest of the job first back into the address card.
  React.useEffect(() => {
    if (data.initial.siteAddress.trim() !== '') return
    try {
      if (window.localStorage.getItem(skipKey) === '1') setFocused(false)
    } catch {
      // Private mode or blocked storage: the focused state simply stays.
    }
  }, [data.initial.siteAddress, skipKey])

  function leaveFocused() {
    try {
      window.localStorage.setItem(skipKey, '1')
    } catch {
      // Non-fatal: the state still expands for this view.
    }
    setFocused(false)
  }

  const priced = data.quote.status === 'PRICED'
  const prereqs = computeDocPrereqs({
    customerName: save.form.customerName,
    priced,
    hasPool: data.hasPool,
    hasShapes: data.hasShapes,
    screenSelected: save.form.screenSelected,
  })

  return (
    <QuoteProvider value={{ priced, total: data.quote.total }}>
      <div data-accent="azure" className="min-h-screen scroll-smooth bg-theme-bg text-theme-fg">
        <ExportCommandHandlers />
        <ProjectHeader
          projectId={data.projectId}
          save={save}
          status={data.status}
          prereqs={prereqs}
          share={data.share}
        />

        {focused ? (
          <div className="container pb-16">
            <FocusedAddress
              save={save}
              mapsEnabled={data.mapsEnabled}
              onDone={leaveFocused}
              onSkip={leaveFocused}
            />
          </div>
        ) : (
          <Reveal>
            <div className="container py-8">
              <div className="lg:grid lg:grid-cols-[10rem_1fr] lg:gap-8">
                <JumpNav />
                <div className="space-y-6">
                  <SiteCustomerSection save={save} mapsEnabled={data.mapsEnabled} />
                  <ProjectSection save={save} memberNames={data.memberNames} />
                  <div id="designs" className="scroll-mt-24">
                    <VersionsCard projectId={data.projectId} versions={data.versions} />
                  </div>
                  <PoolSection save={save} depth={data.depth} projectId={data.projectId} />
                  <EquipmentSection save={save} />
                  <div id="line-items" className="scroll-mt-24">
                    <ProjectLineItems
                      projectId={data.projectId}
                      items={data.lineItems}
                      priceBookChoices={data.priceBookChoices}
                    />
                  </div>
                  <DocumentsCard projectId={data.projectId} prereqs={prereqs} share={data.share} />
                </div>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </QuoteProvider>
  )
}

/** The full page arriving after the focused state, without a reload. */
function Reveal({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className={cn(
        'transition-all duration-500 ease-brand',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      {children}
    </div>
  )
}

const JUMP_TARGETS = [
  { href: '#site', label: 'Site & customer' },
  { href: '#project', label: 'Project' },
  { href: '#designs', label: 'Designs' },
  { href: '#pool', label: 'Pool' },
  { href: '#equipment', label: 'Equipment' },
  { href: '#line-items', label: 'Added to this job' },
  { href: '#documents', label: 'Documents' },
] as const

/** Section links, on wide screens only. */
function JumpNav() {
  return (
    <nav aria-label="Sections" className="hidden lg:block">
      <ul className="sticky top-20 space-y-1.5">
        {JUMP_TARGETS.map((target) => (
          <li key={target.href}>
            <a
              href={target.href}
              className="block text-bodyS text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
            >
              {target.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
