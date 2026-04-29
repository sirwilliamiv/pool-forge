'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Copy, Archive, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  archiveProject,
  deleteProject,
  duplicateProject,
} from '@/modules/projects/actions'

export interface ProjectCardMenuProps {
  projectId: string
  projectName: string
}

export function ProjectCardMenu({ projectId, projectName }: ProjectCardMenuProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function stop(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    e.preventDefault()
  }

  function onDuplicate(e: React.MouseEvent) {
    stop(e)
    startTransition(async () => {
      try {
        const result = await duplicateProject(projectId)
        toast.success('Project duplicated')
        router.push(`/projects/${result.id}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to duplicate')
      }
    })
  }

  function onArchive(e: React.MouseEvent) {
    stop(e)
    startTransition(async () => {
      try {
        await archiveProject(projectId)
        toast.success('Project archived')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to archive')
      }
    })
  }

  function onDeleteConfirmed() {
    startTransition(async () => {
      try {
        await deleteProject(projectId)
        toast.success('Project deleted')
        setConfirmOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={stop}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Project actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" onClick={stop}>
          <DropdownMenuItem onSelect={() => router.push(`/projects/${projectId}/editor`)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open editor
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} disabled={pending}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive} disabled={pending}>
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              stop(e)
              setConfirmOpen(true)
            }}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClick={stop}>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{projectName}</strong>? This will remove the drawing,
              quotes, exports, and validation runs. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                stop(e)
                setConfirmOpen(false)
              }}
              disabled={pending}
            >
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
