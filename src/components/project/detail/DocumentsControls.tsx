'use client'

import * as React from 'react'
import { ChevronDown, FileText, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { runExportCommand } from '@/components/exports/ExportCommandHandlers'
import type { ExportCommandId } from '@/modules/exports/routes'
import { ShareLinkControl } from './ShareLinkControl'

/**
 * Why a document cannot be generated yet, per document. An empty list means
 * the button is live. The reasons are sentences because they are shown to the
 * user verbatim: a disabled button that will not say why is a dead end.
 */
export interface DocPrereqs {
  proposal: string[]
  construction: string[]
  sitePlan: string[]
  screenRfq: string[]
}

export function computeDocPrereqs(input: {
  customerName: string
  priced: boolean
  hasPool: boolean
  hasShapes: boolean
  screenSelected: boolean
}): DocPrereqs {
  const proposal: string[] = []
  if (!input.customerName.trim()) proposal.push('a customer name')
  if (!input.priced) proposal.push('a priced design')

  const construction: string[] = []
  if (!input.hasPool) construction.push('a pool in the drawing')

  const sitePlan: string[] = []
  if (!input.hasShapes) sitePlan.push('something drawn on the site')

  const screenRfq: string[] = []
  if (!input.screenSelected) screenRfq.push('the screen enclosure option turned on')

  return { proposal, construction, sitePlan, screenRfq }
}

function reasonLine(missing: string[]): string | null {
  if (missing.length === 0) return null
  return `Needs ${missing.join(' and ')}.`
}

interface DocSpec {
  key: keyof DocPrereqs
  command: ExportCommandId
  label: string
  tag?: string
  description: string
  input?: Record<string, string>
}

const DOCS: DocSpec[] = [
  {
    key: 'proposal',
    command: 'export.customerProposal',
    label: 'Customer proposal',
    description: 'The priced, signable document the customer reads.',
  },
  {
    key: 'construction',
    command: 'export.constructionPacket',
    label: 'Construction packet',
    tag: '11×17',
    description: 'Dense measured sheets for the crew and the permit desk.',
    input: { pageSize: 'tabloid' },
  },
  {
    key: 'sitePlan',
    command: 'export.sitePlan',
    label: 'Site plan',
    description: 'The lot, the pool, and the permit facts in a title block.',
  },
  {
    key: 'screenRfq',
    command: 'export.screenEnclosureQuote',
    label: 'Screen enclosure RFQ',
    description: 'A quote request to send the cage subcontractor.',
  },
]

function openDoc(doc: DocSpec, projectId: string) {
  runExportCommand(doc.command, { projectId, ...(doc.input ?? {}) })
}

/** The four documents as compact rows: the popover's body, also the rail's. */
export function DocumentsList({ projectId, prereqs }: { projectId: string; prereqs: DocPrereqs }) {
  return (
    <div className="space-y-1">
      {DOCS.map((doc) => {
        const reason = reasonLine(prereqs[doc.key])
        return (
          <div key={doc.command} className="rounded-brand px-2 py-1.5 hover:bg-theme-card">
            <button
              type="button"
              className="block w-full text-left disabled:cursor-not-allowed"
              disabled={reason !== null}
              onClick={() => openDoc(doc, projectId)}
            >
              <span className={`text-bodyS font-medium ${reason ? 'text-theme-faint' : 'text-theme-fg'}`}>
                {doc.label}
                {doc.tag ? (
                  <span className="ml-1.5 font-brandMono text-badge uppercase text-theme-faint">{doc.tag}</span>
                ) : null}
              </span>
              <span className="block text-bodyS text-theme-muted">{reason ?? doc.description}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The header's document affordance. On wide screens a button group; below
 * that, one "Documents" popover trigger. `variant: 'popover'` forces the
 * popover at every width (the C2 model, where there is no card on the page).
 */
export function DocumentsHeader({
  projectId,
  prereqs,
  variant,
  share,
}: {
  projectId: string
  prereqs: DocPrereqs
  variant: 'group' | 'popover'
  share: { token: string | null; accepted: { name: string; at: string } | null } | null
}) {
  const group = (
    <div className={variant === 'group' ? 'hidden xl:flex xl:items-center xl:gap-1' : 'hidden'}>
      {DOCS.map((doc) => {
        const reason = reasonLine(prereqs[doc.key])
        return (
          <Button
            key={doc.command}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-bodyS text-theme-muted hover:text-theme-fg"
            disabled={reason !== null}
            title={reason ?? doc.label}
            onClick={() => openDoc(doc, projectId)}
          >
            {doc.command === 'export.constructionPacket' ? (
              <Printer className="mr-1 h-3.5 w-3.5" aria-hidden />
            ) : (
              <FileText className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            {doc.label.replace('Customer proposal', 'Proposal').replace('Screen enclosure RFQ', 'Screen RFQ')}
          </Button>
        )
      })}
    </div>
  )

  const popover = (
    <div className={variant === 'group' ? 'xl:hidden' : ''}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Documents
            <ChevronDown className="ml-1 h-3 w-3" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 border-theme-line bg-theme-bg p-3 text-theme-fg">
          <DocumentsList projectId={projectId} prereqs={prereqs} />
          {share ? (
            <div className="mt-3 border-t border-theme-line pt-3">
              <p className="mb-2 font-brandMono text-badge uppercase text-theme-muted">Share proposal</p>
              <ShareLinkControl
                projectId={projectId}
                initialToken={share.token}
                accepted={share.accepted}
                compact
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )

  return (
    <div className="flex items-center gap-1">
      {group}
      {popover}
    </div>
  )
}

/**
 * The full Documents & share card for the end of the page (C1), or the
 * collapsed-until-priced variant near the top (C3).
 */
export function DocumentsCard({
  projectId,
  prereqs,
  share,
  variant,
  priced,
}: {
  projectId: string
  prereqs: DocPrereqs
  share: { token: string | null; accepted: { name: string; at: string } | null }
  variant: 'full' | 'collapsed-until-priced'
  priced: boolean
}) {
  const [expanded, setExpanded] = React.useState(variant === 'full' || priced)
  React.useEffect(() => {
    if (priced) setExpanded(true)
  }, [priced])

  if (variant === 'collapsed-until-priced' && !expanded) {
    return (
      <Card id="documents">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="text-bodyS text-theme-muted">
            <span className="mr-2 font-brandMono text-badge uppercase text-theme-muted">Documents</span>
            Four documents unlock as the job is priced.
          </p>
          <button
            type="button"
            className="flex items-center gap-1 text-bodyS text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
            onClick={() => setExpanded(true)}
          >
            Show anyway
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card id="documents">
      <CardHeader>
        <CardTitle>Documents &amp; share</CardTitle>
        <CardDescription>
          Everything this job can produce. A document that cannot be generated yet says why.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DOCS.map((doc) => {
            const reason = reasonLine(prereqs[doc.key])
            return (
              <div
                key={doc.command}
                className="flex items-start justify-between gap-3 rounded-brand border border-theme-lineSoft p-3.5"
              >
                <div>
                  <p className={`text-bodyL ${reason ? 'text-theme-faint' : 'text-theme-fg'}`}>
                    {doc.label}
                    {doc.tag ? (
                      <span className="ml-1.5 font-brandMono text-badge uppercase text-theme-faint">{doc.tag}</span>
                    ) : null}
                  </p>
                  <p className="text-bodyS text-theme-muted">{reason ?? doc.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reason !== null}
                  onClick={() => openDoc(doc, projectId)}
                >
                  Open
                </Button>
              </div>
            )
          })}
        </div>
        <div className="border-t border-theme-line pt-4">
          <p className="mb-2 font-brandMono text-badge uppercase text-theme-muted">Share proposal</p>
          <ShareLinkControl projectId={projectId} initialToken={share.token} accepted={share.accepted} />
        </div>
      </CardContent>
    </Card>
  )
}
