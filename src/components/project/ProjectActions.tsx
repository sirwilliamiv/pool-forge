'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProjectStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusDropdown } from '@/components/dashboard/StatusDropdown'
import {
  archiveProject,
  deleteProject,
  duplicateProject,
} from '@/modules/projects/actions'

export interface ProjectActionsProps {
  project: {
    id: string
    name: string
    status: ProjectStatus
  }
}

export function ProjectActions({ project }: ProjectActionsProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function onDuplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateProject(project.id)
        toast.success('Project duplicated')
        router.push(`/projects/${result.id}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to duplicate')
      }
    })
  }

  function onArchive() {
    startTransition(async () => {
      try {
        await archiveProject(project.id)
        toast.success('Project archived')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to archive')
      }
    })
  }

  function onDeleteConfirmed() {
    startTransition(async () => {
      try {
        await deleteProject(project.id)
        toast.success('Project deleted')
        router.push('/dashboard')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <StatusDropdown projectId={project.id} status={project.status} size="md" />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/projects/${project.id}/editor`}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open editor
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={pending}>
            <Copy className="mr-1.5 h-4 w-4" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={onArchive} disabled={pending}>
            <Archive className="mr-1.5 h-4 w-4" />
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{project.name}</strong>? This will remove the drawing,
              quotes, exports, and validation runs. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDeleteConfirmed} disabled={pending}>
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
