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
        <DropdownMenuContent
          align="end"
          className="w-48 border-theme-line bg-theme-bg text-theme-fg shadow-elevation1"
          onClick={stop}
        >
          <DropdownMenuItem
            className="focus:bg-theme-card focus:text-theme-fg"
            onSelect={() => router.push(`/projects/${projectId}/editor`)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open editor
          </DropdownMenuItem>
          <DropdownMenuItem
            className="focus:bg-theme-card focus:text-theme-fg"
            onClick={onDuplicate}
            disabled={pending}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            className="focus:bg-theme-card focus:text-theme-fg"
            onClick={onArchive}
            disabled={pending}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-theme-line" />
          <DropdownMenuItem
            onClick={(e) => {
              stop(e)
              setConfirmOpen(true)
            }}
            disabled={pending}
            className="text-brand-red focus:bg-theme-card focus:text-brand-red"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="rounded-brand16 border-theme-line bg-theme-bg text-theme-fg sm:rounded-brand16"
          onClick={stop}
        >
          <DialogHeader>
            <DialogTitle className="text-title4 font-semibold text-theme-fg">Delete project</DialogTitle>
            <DialogDescription className="text-bodyS text-theme-muted">
              Permanently delete <strong className="text-theme-fg">{projectName}</strong>? This will remove
              the drawing, quotes, exports, and validation runs. This cannot be undone.
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
