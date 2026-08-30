'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Copy, ExternalLink, FileText, Printer, ScanLine, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProjectStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  ExportCommandHandlers,
  runExportCommand,
} from '@/components/exports/ExportCommandHandlers'
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
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <StatusDropdown projectId={project.id} status={project.status} size="md" />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/projects/${project.id}/editor`}>
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open editor
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.id}/import`}>
                <ScanLine className="mr-1.5 h-4 w-4" />
                Import from image
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
              className="text-brand-red hover:text-brand-red"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Document exports — each dispatches an export command, which records the
          Export row and opens the document in a new tab. */}
      <ExportCommandHandlers />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="font-brandMono text-badge uppercase text-theme-muted">Documents</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runExportCommand('export.customerProposal', { projectId: project.id })}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Customer proposal
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                runExportCommand('export.constructionPacket', {
                  projectId: project.id,
                  pageSize: 'tabloid',
                })
              }
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Construction packet
              <span className="ml-1 font-brandMono text-badge uppercase text-theme-faint">
                11×17
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runExportCommand('export.sitePlan', { projectId: project.id })}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Site plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                runExportCommand('export.screenEnclosureQuote', { projectId: project.id })
              }
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Screen enclosure RFQ
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-theme-bg border-theme-line">
          <DialogHeader>
            <DialogTitle className="text-title3 font-medium">Delete project</DialogTitle>
            <DialogDescription className="text-bodyL text-theme-muted">
              Permanently delete <strong className="text-theme-fg">{project.name}</strong>? This
              will remove the drawing, quotes, exports, and validation runs. This cannot be undone.
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
