// One assembly of each document, used twice.
//
// The four document routes each loaded a project, priced it, and hand-built the
// props for a document component. Storing a copy of what was sent meant a fifth
// place doing the same thing, and a stored copy assembled slightly differently
// from the page it claims to be a copy of is not a record, it is a second
// opinion. So the assembly moved here: the route renders `built.element` inside
// its chrome, and the renderer serialises the same element to bytes.
//
// Everything here is org-scoped. `orgId` is a required parameter rather than
// something read from a session, because the share page has no session: it
// resolves a project from an unguessable token and passes that project's own
// org, which is the only org it is allowed to see.

import type { ReactElement } from 'react'

import { ExportKind } from '@prisma/client'

import { db } from '@/lib/db'
import {
  COMPANY_PROFILE_SELECT,
  DEFAULT_PROPOSAL_TERMS,
  parsePaymentSchedule,
} from '@/modules/organization/company'
import { effectiveLightingQuantity } from '@/modules/pricing/engine'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { ConstructionDocument } from '@/components/exports/ConstructionDocument'
import type { ConstructionPageSize } from '@/components/exports/ConstructionDocument'
import { ProposalDocument } from '@/components/exports/ProposalDocument'
import { ScreenEnclosureQuoteDocument } from '@/components/exports/ScreenEnclosureQuoteDocument'
import { SitePlanDocument } from '@/components/exports/SitePlanDocument'

import type { DocumentProvenance } from './html'
import { documentKindLabel, type DocumentKind, type DocumentOptions } from './kinds'
import { PAGE_CSS } from './print-css'

export interface BuiltDocument {
  kind: DocumentKind
  /** The document itself. The route wraps it in chrome; the renderer does not. */
  element: ReactElement
  title: string
  /** Applied to the stored file's root element. */
  rootClassName: string
  /** Page setup for this kind: paper size, margins, page breaks. */
  pageCss: string
  provenance: DocumentProvenance
}

function title(kind: DocumentKind, projectName: string, jobNumber: number | null): string {
  const label = documentKindLabel(kind)
  return jobNumber === null
    ? `${label} · ${projectName}`
    : `${label} · Job ${jobNumber} · ${projectName}`
}

/**
 * Build one document, or null when the project is not this organisation's.
 *
 * Null rather than a throw, on the same principle as `loadProjectQuote`: a
 * project that is not yours is an ordinary answer, not an exception.
 */
export async function buildExportDocument(args: {
  kind: DocumentKind
  projectId: string
  orgId: string
  options: DocumentOptions
}): Promise<BuiltDocument | null> {
  switch (args.kind) {
    case ExportKind.CUSTOMER_PROPOSAL:
      return buildProposal(args.projectId, args.orgId)
    case ExportKind.CONSTRUCTION_PACKET:
      return buildConstructionPacket(
        args.projectId,
        args.orgId,
        args.options.pageSize === 'letter' ? 'letter' : 'tabloid',
      )
    case ExportKind.SITE_PLAN:
      return buildSitePlan(args.projectId, args.orgId)
    case ExportKind.SCREEN_ENCLOSURE_QUOTE:
      return buildScreenEnclosureQuote(args.projectId, args.orgId, {
        showInternalPricing: args.options.showInternalPricing === true,
        showScreenScopeRetail: args.options.showScreenScopeRetail === true,
      })
  }
}

async function buildProposal(projectId: string, orgId: string): Promise<BuiltDocument | null> {
  // Priced load (its own project + price book + materials + line-item reads)
  // started before the project fetch is awaited, so the two overlap instead of
  // running back to back. Both are awaited below.
  const pricedPromise = loadProjectQuote(projectId, orgId)
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: {
      customer: true,
      // The same company details, schedule and terms on both copies. The
      // customer's is the one that gets signed, so it cannot be the thinner
      // document of the two.
      org: {
        select: {
          ...COMPANY_PROFILE_SELECT,
          taxRatePct: true,
          paymentSchedule: true,
          proposalTerms: true,
          proposalValidDays: true,
        },
      },
    },
  })
  const priced = await pricedPromise
  if (!project || !priced) return null
  const { measurements, quote, selections, shapes, poolFields, priceBookId } = priced

  const element = (
    <ProposalDocument
      // The loader's pool fields, not the raw column: they carry the interior
      // finish and coping the pool is actually drawn with.
      project={{ ...project, poolFields }}
      customer={project.customer}
      measurements={measurements}
      quote={quote}
      selections={{
        heaterSelected: selections.heaterSelected ?? false,
        saltSystemSelected: selections.saltSystemSelected ?? false,
        screenSelected: selections.screenSelected ?? false,
        // The lights the quote actually bills, which is the drawing's count
        // when there is one.
        lightingQuantity: effectiveLightingQuantity(measurements, selections),
      }}
      company={{
        name: project.org.name,
        logoUrl: project.org.logoUrl,
        brandColor: project.org.brandColor,
        address: project.org.address,
        phone: project.org.phone,
        email: project.org.email,
        licenseNumber: project.org.licenseNumber,
      }}
      // Never assigned here. Numbering is a write, and this builder runs on a
      // public route; the number is stamped when the project is created and
      // when the builder opens the proposal or creates the share link.
      jobNumber={project.jobNumber}
      paymentSchedule={parsePaymentSchedule(project.org.paymentSchedule)}
      proposalValidDays={project.org.proposalValidDays}
      terms={project.org.proposalTerms?.trim() || DEFAULT_PROPOSAL_TERMS}
      shapes={shapes}
    />
  )

  return {
    kind: ExportKind.CUSTOMER_PROPOSAL,
    element,
    title: title(ExportKind.CUSTOMER_PROPOSAL, project.name, project.jobNumber),
    rootClassName: '',
    pageCss: PAGE_CSS[ExportKind.CUSTOMER_PROPOSAL],
    provenance: {
      kind: ExportKind.CUSTOMER_PROPOSAL,
      projectId: project.id,
      projectName: project.name,
      jobNumber: project.jobNumber,
      generatedAt: new Date(),
      priceBookId,
    },
  }
}

async function buildConstructionPacket(
  projectId: string,
  orgId: string,
  pageSize: ConstructionPageSize,
): Promise<BuiltDocument | null> {
  // Priced load (its own project + price book + materials + line-item reads)
  // started before the project fetch is awaited, so the two overlap instead of
  // running back to back. Both are awaited below.
  const pricedPromise = loadProjectQuote(projectId, orgId)
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: { customer: true, org: { select: { taxRatePct: true } } },
  })
  const priced = await pricedPromise
  if (!project || !priced) return null
  const { shapes, measurements, quote, poolFields, priceBookId } = priced

  const element = (
    <ConstructionDocument
      project={{
        id: project.id,
        jobNumber: project.jobNumber,
        name: project.name,
        salesperson: project.salesperson,
        designer: project.designer,
        internalNotes: project.internalNotes,
        poolFields,
        createdAt: project.createdAt,
      }}
      customer={
        project.customer
          ? {
              name: project.customer.name,
              email: project.customer.email,
              phone: project.customer.phone,
              // The geocoded site address is canonical; the customer's
              // free-text address is a billing fact, not a location.
              address: project.siteAddress ?? project.customer.address,
            }
          : null
      }
      shapes={shapes}
      measurements={measurements}
      quote={quote}
      pageSize={pageSize}
    />
  )

  return {
    kind: ExportKind.CONSTRUCTION_PACKET,
    element,
    title: title(ExportKind.CONSTRUCTION_PACKET, project.name, project.jobNumber),
    rootClassName: '',
    pageCss: PAGE_CSS[ExportKind.CONSTRUCTION_PACKET],
    provenance: {
      kind: ExportKind.CONSTRUCTION_PACKET,
      projectId: project.id,
      projectName: project.name,
      jobNumber: project.jobNumber,
      generatedAt: new Date(),
      priceBookId,
    },
  }
}

async function buildSitePlan(projectId: string, orgId: string): Promise<BuiltDocument | null> {
  // Priced load (its own project + price book + materials + line-item reads)
  // started before the project fetch is awaited, so the two overlap instead of
  // running back to back. Both are awaited below.
  const pricedPromise = loadProjectQuote(projectId, orgId)
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: { customer: true },
  })
  const priced = await pricedPromise
  if (!project || !priced) return null
  const { shapes, measurements, priceBookId } = priced

  // Survey image overlay is still editor-side state; render without an
  // underlay until it lives on the server.
  const surveyImageUrl: string | null = null

  // Columns, not `poolFields`: these are permit facts about the property and
  // they are typed on the project page.
  const jurisdiction = project.jurisdiction?.trim() || null
  const parcelId = project.parcelId?.trim() || null

  const element = (
    <SitePlanDocument
      project={{
        id: project.id,
        name: project.name,
        salesperson: project.salesperson,
        designer: project.designer,
        internalNotes: project.internalNotes,
        poolFields: project.poolFields,
        createdAt: project.createdAt,
      }}
      customer={
        project.customer
          ? {
              name: project.customer.name,
              email: project.customer.email,
              phone: project.customer.phone,
              // The geocoded site address is canonical; the customer's
              // free-text address is a billing fact, not a location.
              address: project.siteAddress ?? project.customer.address,
            }
          : null
      }
      shapes={shapes}
      measurements={measurements}
      surveyImageUrl={surveyImageUrl}
      jurisdiction={jurisdiction}
      parcelId={parcelId}
    />
  )

  return {
    kind: ExportKind.SITE_PLAN,
    element,
    title: title(ExportKind.SITE_PLAN, project.name, project.jobNumber),
    rootClassName: '',
    pageCss: PAGE_CSS[ExportKind.SITE_PLAN],
    provenance: {
      kind: ExportKind.SITE_PLAN,
      projectId: project.id,
      projectName: project.name,
      jobNumber: project.jobNumber,
      generatedAt: new Date(),
      priceBookId,
    },
  }
}

async function buildScreenEnclosureQuote(
  projectId: string,
  orgId: string,
  flags: { showInternalPricing: boolean; showScreenScopeRetail: boolean },
): Promise<BuiltDocument | null> {
  // Priced load (its own project + price book + materials + line-item reads)
  // started before the project fetch is awaited, so the two overlap instead of
  // running back to back. Both are awaited below.
  const pricedPromise = loadProjectQuote(projectId, orgId)
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: { customer: true, org: { select: { name: true, taxRatePct: true } } },
  })
  const priced = await pricedPromise
  if (!project || !priced) return null
  const { shapes, measurements, quote, priceBookId } = priced

  const element = (
    <ScreenEnclosureQuoteDocument
      project={{
        id: project.id,
        name: project.name,
        salesperson: project.salesperson,
        internalNotes: project.internalNotes,
        poolFields: project.poolFields,
        createdAt: project.createdAt,
      }}
      customer={
        project.customer
          ? {
              name: project.customer.name,
              email: project.customer.email,
              phone: project.customer.phone,
              // The geocoded site address is canonical; the customer's
              // free-text address is a billing fact, not a location.
              address: project.siteAddress ?? project.customer.address,
            }
          : null
      }
      shapes={shapes}
      measurements={measurements}
      quote={quote}
      companyName={project.org.name}
      showInternalPricing={flags.showInternalPricing}
      showScreenScopeRetail={flags.showScreenScopeRetail}
    />
  )

  return {
    kind: ExportKind.SCREEN_ENCLOSURE_QUOTE,
    element,
    title: title(ExportKind.SCREEN_ENCLOSURE_QUOTE, project.name, project.jobNumber),
    rootClassName: '',
    pageCss: PAGE_CSS[ExportKind.SCREEN_ENCLOSURE_QUOTE],
    provenance: {
      kind: ExportKind.SCREEN_ENCLOSURE_QUOTE,
      projectId: project.id,
      projectName: project.name,
      jobNumber: project.jobNumber,
      generatedAt: new Date(),
      priceBookId,
    },
  }
}
