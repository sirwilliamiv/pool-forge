import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { EditorShell } from '@/components/editor/EditorShell'
import { EditorPersistence } from '@/components/editor/EditorPersistence'
import { SaveStatus } from '@/components/editor/SaveStatus'
import { ValidationDock } from '@/components/editor/ValidationDock'
import { loadDrawing } from '@/modules/editor/persistence'
import type { ValidationProject } from '@/modules/validation/types'

export default async function ProjectEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      orgId: true,
      poolFields: true,
      proposalExpiresAt: true,
      customer: { select: { name: true, address: true } },
    },
  })
  if (!project || project.orgId !== orgId) notFound()

  let initial: { shapes: never[] } | Awaited<ReturnType<typeof loadDrawing>>
  try {
    initial = await loadDrawing(project.id)
  } catch (err) {
    console.error('loadDrawing failed', err)
    initial = { shapes: [] }
  }

  const poolFields =
    project.poolFields && typeof project.poolFields === 'object' && !Array.isArray(project.poolFields)
      ? (project.poolFields as Record<string, unknown>)
      : {}

  const validationProject: ValidationProject = {
    name: project.name,
    customerName: project.customer?.name ?? null,
    address: project.customer?.address ?? null,
    poolFields,
    proposalExpiresAt: project.proposalExpiresAt ? project.proposalExpiresAt.toISOString() : null,
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-background px-4 py-2">
        <div className="text-sm">
          <Link href={`/projects/${project.id}`} className="text-muted-foreground hover:text-foreground">
            ← {project.name}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-72">
            <ValidationDock project={validationProject} />
          </div>
          <SaveStatus />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorShell projectId={project.id} />
        <EditorPersistence projectId={project.id} initial={initial} />
      </div>
    </div>
  )
}
