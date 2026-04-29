import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { EditorShell } from '@/components/editor/EditorShell'

export default async function ProjectEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true, orgId: true } })
  if (!project || project.orgId !== orgId) notFound()

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="text-sm">
          <Link href={`/projects/${project.id}`} className="text-muted-foreground hover:text-foreground">
            ← {project.name}
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorShell projectId={project.id} />
      </div>
    </div>
  )
}
