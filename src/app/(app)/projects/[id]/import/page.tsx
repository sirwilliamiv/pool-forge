import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ImportReviewScreen } from '@/components/imports/ImportReviewScreen'
import { AwaitingImagesState, StartImportState } from '@/components/imports/ImportEmptyState'
import {
  buildSourceImageViews,
  formatAppliedAt,
} from '@/components/imports/session-view'
import type { ImportSessionView, ProjectView } from '@/components/imports/types'
import { emptyDesignIntent } from '@/modules/imports/intent'
import { parseStoredIntent } from '@/modules/imports/patch'

// A real route rather than a view flag on the editor: inline view switching
// bypasses route-level data loading, and this screen needs the session, its
// images, and their analysis ledger resolved before it renders.
//
// Reads happen here, in the server component, org-scoped like every other page
// in the app. Every write on this screen goes through `/api/commands`, so the
// audit log records what the user actually did.

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const authSession = await auth()
  if (!authSession?.user) redirect('/login')
  const orgId = authSession.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const query = await searchParams

  const project = await db.project.findFirst({
    where: { id, orgId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  const projectView: ProjectView = { id: project.id, name: project.name }

  // An explicit `?session=` wins so a builder can reopen an older import;
  // otherwise the newest one still open for this project.
  const requested = query.session
  const requestedSessionId = typeof requested === 'string' ? requested : undefined

  const importSession = await db.importSession.findFirst({
    where: requestedSessionId
      ? { id: requestedSessionId, orgId }
      : { orgId, projectId: project.id, status: { in: ['DRAFT', 'READY'] } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      status: true,
      designIntentJson: true,
      touchedFieldPaths: true,
      appliedAt: true,
    },
  })

  if (!importSession) {
    return <StartImportState project={projectView} />
  }

  const intent = parseStoredIntent(importSession.designIntentJson) ?? emptyDesignIntent()

  const imageRows =
    intent.sourceImageIds.length === 0
      ? []
      : await db.sourceImage.findMany({
          where: { id: { in: intent.sourceImageIds }, orgId },
          select: { id: true, kind: true, widthPx: true, heightPx: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })

  if (imageRows.length === 0) {
    return <AwaitingImagesState project={projectView} sessionId={importSession.id} />
  }

  const analyses = await db.imageAnalysis.findMany({
    where: { sourceImageId: { in: imageRows.map((row) => row.id) } },
    select: {
      sourceImageId: true,
      stage: true,
      status: true,
      errorRef: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })

  const view: ImportSessionView = {
    id: importSession.id,
    status: importSession.status,
    intent,
    touchedFieldPaths: importSession.touchedFieldPaths,
    images: buildSourceImageViews(intent.sourceImageIds, imageRows, analyses),
    appliedAtLabel: formatAppliedAt(importSession.appliedAt),
  }

  return <ImportReviewScreen project={projectView} session={view} />
}
