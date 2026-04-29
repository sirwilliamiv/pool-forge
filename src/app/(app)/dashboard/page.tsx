import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ProjectStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { StatusFilter } from '@/components/dashboard/StatusFilter'
import { NewProjectDialog } from '@/components/dashboard/NewProjectDialog'

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
  const session = await auth()
  const orgId = session?.user?.orgId
  const userId = session?.user?.id
  if (!session || !orgId || !userId) return { ok: false, error: 'Not authenticated' }
  const trimmedName = input.name.trim()
  if (!trimmedName) return { ok: false, error: 'Project name required' }

  const project = await db.$transaction(async (tx) => {
    let customerId: string | undefined
    if (input.customerName.trim()) {
      const customer = await tx.customer.create({
        data: { orgId, name: input.customerName.trim() },
      })
      customerId = customer.id
    }
    return tx.project.create({
      data: {
        orgId,
        name: trimmedName,
        ...(customerId ? { customerId } : {}),
      },
    })
  })

  return { ok: true, id: project.id }
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

  const where: { orgId: string; status?: ProjectStatus } = { orgId }
  if (status) where.status = status

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
          No projects yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <StatusBadge status={p.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {p.customer ? <div>{p.customer.name}</div> : <div className="italic">No customer</div>}
                  <div>Updated {p.updatedAt.toLocaleDateString()}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
