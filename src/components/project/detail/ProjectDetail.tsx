'use client'

import * as React from 'react'
import Link from 'next/link'
import { ExportCommandHandlers } from '@/components/exports/ExportCommandHandlers'
import { ProjectLineItems } from '@/components/project/ProjectLineItems'
import { VersionsCard } from '@/components/versions/VersionsCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatUsd } from '@/lib/money'
import { cn } from '@/lib/utils'
import { computeDocPrereqs, DocumentsCard, DocumentsList } from './DocumentsControls'
import { DesignsStrip } from './DesignsStrip'
import { FocusedAddress } from './FocusedAddress'
import {
  EquipmentSection,
  PoolSection,
  ProjectSection,
  SiteCustomerSection,
} from './FormSections'
import { ProjectHeader, QuoteProvider } from './ProjectHeader'
import { ShareLinkControl } from './ShareLinkControl'
import { SiteMapThumb } from './SiteMapThumb'
import { STATUS_LABELS } from './StatusControl'
import { useProjectSave } from './useProjectSave'
import { LAYOUT_IDS, LAYOUTS, type LayoutId, type ProjectDetailData } from './types'

/**
 * The project page, in five arrangements under comparison (`?layout=1..5`).
 *
 * One implementation: every option shares the sections, the sticky header,
 * the focused address state and the save hook, and differs only in how they
 * are composed. That is what keeps five prototypes honest — a fix lands in
 * all of them.
 */
export function ProjectDetail({ data, layout }: { data: ProjectDetailData; layout: LayoutId }) {
  const spec = LAYOUTS[layout]
  const save = useProjectSave(data.projectId, data.initial, spec.save)
  const [focused, setFocused] = React.useState(data.initial.siteAddress.trim() === '')

  const priced = data.quote.status === 'PRICED'
  const prereqs = computeDocPrereqs({
    customerName: save.form.customerName,
    priced,
    hasPool: data.hasPool,
    hasShapes: data.hasShapes,
    screenSelected: save.form.screenSelected,
  })

  const lineItems = (
    <div id="line-items" className="scroll-mt-24">
      <ProjectLineItems
        projectId={data.projectId}
        items={data.lineItems}
        priceBookChoices={data.priceBookChoices}
      />
    </div>
  )
  const designsCard = (
    <div id="designs" className="scroll-mt-24">
      <VersionsCard projectId={data.projectId} versions={data.versions} />
    </div>
  )
  const designs =
    spec.designs === 'strip' ? (
      <DesignsStrip projectId={data.projectId} versions={data.versions} />
    ) : (
      designsCard
    )
  const docsCard =
    spec.docs === 'popover' ? null : (
      <DocumentsCard
        projectId={data.projectId}
        prereqs={prereqs}
        share={data.share}
        variant={spec.docs === 'collapsed-card' ? 'collapsed-until-priced' : 'full'}
        priced={priced}
      />
    )

  return (
    <QuoteProvider value={{ priced, total: data.quote.total }}>
      <div data-accent="azure" className="min-h-screen scroll-smooth bg-theme-bg text-theme-fg">
        <ExportCommandHandlers />
        <ProjectHeader
          projectId={data.projectId}
          save={save}
          status={data.status}
          statusModel={spec.statusModel}
          docsVariant={spec.docs === 'popover' ? 'popover' : 'group'}
          prereqs={prereqs}
          share={data.share}
        />

        {focused ? (
          <div className="container pb-16">
            <FocusedAddress
              save={save}
              mapsEnabled={data.mapsEnabled}
              onDone={() => setFocused(false)}
              onSkip={() => setFocused(false)}
            />
          </div>
        ) : (
          <Reveal>
            <div className="container py-8">
              {spec.shape === 'long' && (
                <div className="lg:grid lg:grid-cols-[10rem_1fr] lg:gap-8">
                  <JumpNav docs={spec.docs !== 'popover'} />
                  <div className="space-y-6">
                    <SiteCustomerSection save={save} mapsEnabled={data.mapsEnabled} />
                    {spec.docs === 'collapsed-card' ? docsCard : null}
                    <ProjectSection save={save} memberNames={data.memberNames} />
                    {designs}
                    <PoolSection save={save} depth={data.depth} projectId={data.projectId} />
                    <EquipmentSection save={save} />
                    {lineItems}
                    {spec.docs === 'group-and-card' ? docsCard : null}
                  </div>
                </div>
              )}

              {spec.shape === 'rail' && (
                <div className="gap-8 min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="space-y-6">
                    <SiteCustomerSection save={save} mapsEnabled={data.mapsEnabled} />
                    <ProjectSection save={save} memberNames={data.memberNames} />
                    {designs}
                    <PoolSection save={save} depth={data.depth} projectId={data.projectId} />
                    <EquipmentSection save={save} />
                    {lineItems}
                  </div>
                  <SummaryRail data={data} form={save.form} prereqs={prereqs} priced={priced} />
                </div>
              )}

              {spec.shape === 'tabs' && (
                <Tabs defaultValue="overview">
                  <TabsList className="mb-6">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="design">Design</TabsTrigger>
                    <TabsTrigger value="specs">Specs</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="space-y-6">
                    <SiteCustomerSection save={save} mapsEnabled={data.mapsEnabled} />
                    <ProjectSection save={save} memberNames={data.memberNames} />
                  </TabsContent>
                  <TabsContent value="design" className="space-y-6">
                    {designs}
                    {lineItems}
                  </TabsContent>
                  <TabsContent value="specs" className="space-y-6">
                    <PoolSection save={save} depth={data.depth} projectId={data.projectId} />
                    <EquipmentSection save={save} />
                  </TabsContent>
                </Tabs>
              )}

              {spec.shape === 'hero' && (
                <div className="space-y-8">
                  {designsCard}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="space-y-6">
                      <SiteCustomerSection save={save} mapsEnabled={data.mapsEnabled} />
                      <PoolSection save={save} depth={data.depth} projectId={data.projectId} />
                      <EquipmentSection save={save} />
                    </div>
                    <div className="space-y-6">
                      <ProjectSection save={save} memberNames={data.memberNames} />
                      {lineItems}
                    </div>
                  </div>
                  {docsCard}
                </div>
              )}
            </div>
          </Reveal>
        )}

        <LayoutSwitcher projectId={data.projectId} current={layout} />
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
] as const

/** Section links for the long shapes, on wide screens only. */
function JumpNav({ docs }: { docs: boolean }) {
  return (
    <nav aria-label="Sections" className="hidden lg:block">
      <ul className="sticky top-20 space-y-1.5">
        {[...JUMP_TARGETS, ...(docs ? [{ href: '#documents', label: 'Documents' } as const] : [])].map(
          (target) => (
            <li key={target.href}>
              <a
                href={target.href}
                className="block text-bodyS text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
              >
                {target.label}
              </a>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}

/** The at-a-glance column for the two-column shape. Everything here is a
 * mirror, not a control — the fields stay editable in one place each. */
function SummaryRail({
  data,
  form,
  prereqs,
  priced,
}: {
  data: ProjectDetailData
  form: ReturnType<typeof useProjectSave>['form']
  prereqs: ReturnType<typeof computeDocPrereqs>
  priced: boolean
}) {
  return (
    <aside className="mt-8 min-[1100px]:mt-0">
      <div className="space-y-5 rounded-brand border border-theme-line bg-theme-card p-4 min-[1100px]:sticky min-[1100px]:top-20">
        {form.latitude !== null && form.longitude !== null ? (
          <SiteMapThumb
            lat={form.latitude}
            lng={form.longitude}
            address={form.siteAddress}
            width={288}
            height={150}
            className="w-full"
          />
        ) : null}
        <div className="space-y-1">
          <p className="font-brandMono text-badge uppercase text-theme-muted">Site</p>
          <p className="text-bodyS text-theme-fg">{form.siteAddress.trim() || 'No address yet'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-brandMono text-badge uppercase text-theme-muted">Customer</p>
          <p className="text-bodyS text-theme-fg">{form.customerName.trim() || 'No customer yet'}</p>
          {form.customerPhone.trim() ? (
            <p className="text-bodyS text-theme-muted">{form.customerPhone}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-brandMono text-badge uppercase text-theme-muted">Status</p>
            <p className="text-bodyS text-theme-fg">{STATUS_LABELS[data.status]}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="font-brandMono text-badge uppercase text-theme-muted">Quote</p>
            <p className="text-bodyS text-theme-fg">
              {priced ? formatUsd(data.quote.total) : 'Not priced'}
            </p>
          </div>
        </div>
        <div className="space-y-2 border-t border-theme-line pt-4">
          <p className="font-brandMono text-badge uppercase text-theme-muted">Documents</p>
          <DocumentsList projectId={data.projectId} prereqs={prereqs} />
        </div>
        <div className="border-t border-theme-line pt-4">
          <p className="mb-2 font-brandMono text-badge uppercase text-theme-muted">Share proposal</p>
          <ShareLinkControl
            projectId={data.projectId}
            initialToken={data.share.token}
            accepted={data.share.accepted}
            compact
          />
        </div>
      </div>
    </aside>
  )
}

/** Comparison chrome, not product: hops between the layout prototypes. */
function LayoutSwitcher({ projectId, current }: { projectId: string; current: LayoutId }) {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-brand border border-theme-line bg-theme-bg px-2 py-1.5 shadow-elevation1">
      <span className="mr-1 font-brandMono text-badge uppercase text-theme-faint">Layout</span>
      {LAYOUT_IDS.map((id) => (
        <Link
          key={id}
          href={`/projects/${projectId}?layout=${id}`}
          aria-current={id === current ? 'page' : undefined}
          className={cn(
            'rounded-brand px-2 py-0.5 font-brandMono text-badge transition-colors duration-brand ease-brand',
            id === current
              ? 'bg-theme-fg text-theme-bg'
              : 'text-theme-muted hover:bg-theme-card hover:text-theme-fg',
          )}
        >
          {id}
        </Link>
      ))}
    </div>
  )
}
