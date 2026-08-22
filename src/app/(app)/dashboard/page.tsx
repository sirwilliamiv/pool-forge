import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ProjectStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusFilter } from '@/components/dashboard/StatusFilter'
import { NewProjectDialog } from '@/components/dashboard/NewProjectDialog'
import { ProjectCardMenu } from '@/components/dashboard/ProjectCardMenu'
import { StatusDropdown } from '@/components/dashboard/StatusDropdown'

const VALID_STATUSES: ProjectStatus[] = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PROPOSAL_SENT',
  'APPROVED',
  'CONSTRUCTION_READY',
  'ARCHIVED',
]

function parseStatus(raw: string | undefined): ProjectStatus | undefined {
  if (!raw) return undefined
  return VALID_STATUSES.includes(raw as ProjectStatus) ? (raw as ProjectStatus) : undefined
}

async function createProjectAction(input: { name: string; customerName: string }) {
  'use server'
  // Through the registry, not around it. This used to hold its own Prisma
  // transaction, which meant the button and the voice agent created projects by
  // two different code paths and only one of them wrote an audit row.
  const session = await auth()
  const orgId = session?.user?.orgId
  const userId = session?.user?.id
  if (!session || !orgId || !userId) return { ok: false, error: 'Not authenticated' }

  const { initCommands } = await import('@/modules/commands/init')
  const { dispatchCommand } = await import('@/modules/commands/dispatch')
  initCommands()

  const customerName = input.customerName.trim()
  const result = await dispatchCommand<{ projectId: string }>(
    'create.project',
    { name: input.name, ...(customerName ? { customerName } : {}) },
    { userId, orgId },
  )

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, id: result.data.projectId }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const sp = await searchParams
  const status = parseStatus(sp.status)

  // Default view hides ARCHIVED unless filter explicitly selects it.
  const where: { orgId: string; status?: ProjectStatus | { not: ProjectStatus } } = { orgId }
  if (status) {
    where.status = status
  } else {
    where.status = { not: 'ARCHIVED' }
  }

  const projects = await db.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { customer: true },
    take: 200,
  })

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Draw the pool. Price the job. Export the proposal.
          </p>
        </div>
        <NewProjectDialog action={createProjectAction} />
      </div>

      <StatusFilter />

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {status
            ? 'No projects match this filter.'
            : "No projects yet — click 'New project' to start."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex-1 truncate hover:underline"
                  >
                    <CardTitle className="text-base truncate">{p.name}</CardTitle>
                  </Link>
                  <ProjectCardMenu projectId={p.id} projectName={p.name} />
                </div>
                <StatusDropdown projectId={p.id} status={p.status} />
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <Link href={`/projects/${p.id}`} className="block hover:underline">
                  {p.customer ? <div>{p.customer.name}</div> : <div className="italic">No customer</div>}
                  <div>Updated {p.updatedAt.toLocaleDateString()}</div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
