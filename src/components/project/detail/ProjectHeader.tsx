'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowLeft,
  Copy,
  ExternalLink,
  MoreHorizontal,
  ScanLine,
  Trash2,
} from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { archiveProject, deleteProject, duplicateProject } from '@/modules/projects/actions'
import { formatUsd } from '@/lib/money'
import { DocumentsHeader, type DocPrereqs } from './DocumentsControls'
import { StatusControl } from './StatusControl'
import type { ProjectSave } from './useProjectSave'

/**
 * The page's state, always on screen.
 *
 * Left to right: back, the name (editable in place), status (set here and
 * nowhere else), the address and price the job currently claims, whether the
 * last change persisted, documents, and the one primary action — Open editor.
 * The occasional actions live behind the overflow menu instead of holding a
 * row of equal-weight buttons.
 */
export function ProjectHeader({
  projectId,
  save,
  status,
  statusModel,
  docsVariant,
  prereqs,
  share,
}: {
  projectId: string
  save: ProjectSave
  status: ProjectStatus
  statusModel: 'confirm' | 'undo'
  docsVariant: 'group' | 'popover'
  prereqs: DocPrereqs
  share: { token: string | null; accepted: { name: string; at: string } | null } | null
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const addressLine = save.form.siteAddress.trim()

  function onDuplicate() {
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

  function onArchive() {
    startTransition(async () => {
      try {
        await archiveProject(projectId)
        toast.success('Project archived')
        router.refresh()
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
        router.push('/dashboard')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete')
      }
    })
  }

  return (
    <div className="sticky top-0 z-40 border-b border-theme-line bg-theme-bg">
      <div className="container flex h-14 items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="Back to projects"
          className="shrink-0 text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>

        <input
          aria-label="Project name"
          id="project-name"
          name="project-name"
          value={save.form.name}
          onChange={(e) => save.update('name', e.target.value)}
          className="w-full min-w-0 max-w-[14rem] shrink truncate rounded-brand border border-transparent bg-transparent px-1.5 py-1 text-bodyXL font-medium text-theme-fg outline-none transition-colors duration-brand ease-brand hover:border-theme-lineSoft focus:border-theme-line"
        />

        <StatusControl projectId={projectId} status={status} model={statusModel} />

        <div className="hidden min-w-0 flex-1 items-baseline gap-3 lg:flex">
          <span className="truncate font-brandMono text-badge text-theme-muted">
            {addressLine || 'No address'}
          </span>
          <span className="shrink-0 font-brandMono text-badge text-theme-fg">
            <QuoteLabel />
          </span>
        </div>
        <div className="min-w-0 flex-1 lg:hidden" />

        <SaveIndicator save={save} />

        <DocumentsHeader
          projectId={projectId}
          prereqs={prereqs}
          variant={docsVariant}
          share={share}
        />

        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href={`/projects/${projectId}/editor`}>
            <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
            Open editor
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 px-0" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-theme-line bg-theme-bg text-theme-fg">
            <DropdownMenuItem asChild className="focus:bg-theme-card focus:text-theme-fg">
              <Link href={`/projects/${projectId}/import`}>
                <ScanLine className="mr-2 h-4 w-4" aria-hidden />
                Import from image
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate} disabled={pending} className="focus:bg-theme-card focus:text-theme-fg">
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive} disabled={pending} className="focus:bg-theme-card focus:text-theme-fg">
              <Archive className="mr-2 h-4 w-4" aria-hidden />
              Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-theme-line" />
            <DropdownMenuItem
              onSelect={() => setConfirmDelete(true)}
              disabled={pending}
              className="text-brand-red focus:bg-theme-card focus:text-brand-red"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="border-theme-line bg-theme-bg">
          <DialogHeader>
            <DialogTitle className="text-title3 font-medium">Delete project</DialogTitle>
            <DialogDescription className="text-bodyL text-theme-muted">
              Permanently delete <strong className="text-theme-fg">{save.form.name}</strong>? This
              will remove the drawing, quotes, exports, and validation runs. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDeleteConfirmed} disabled={pending}>
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The quote figure is server-derived and changes rarely relative to typing, so
 * it comes in through context rather than being threaded through every prop
 * list on the page.
 */
const QuoteContext = React.createContext<{ priced: boolean; total: number }>({
  priced: false,
  total: 0,
})
export const QuoteProvider = QuoteContext.Provider

function QuoteLabel() {
  const quote = React.useContext(QuoteContext)
  return <>{quote.priced ? formatUsd(quote.total) : 'Not priced'}</>
}

/**
 * Whether the last change persisted, said out loud.
 *
 * Autosave mode announces Saving… / Saved / a retry. Manual mode is the Save
 * button itself: solid with a count while dirty, quiet when clean, Cmd/Ctrl+S
 * as the shortcut.
 */
export function SaveIndicator({ save }: { save: ProjectSave }) {
  if (save.mode === 'manual') {
    return (
      <span aria-live="polite" className="flex shrink-0 items-center">
        <Button
          size="sm"
          variant={save.dirtyCount > 0 ? 'default' : 'outline'}
          className="h-8"
          disabled={save.saveState === 'saving' || (save.dirtyCount === 0 && save.saveState !== 'error')}
          onClick={save.flush}
          title="Cmd/Ctrl+S"
        >
          {save.saveState === 'saving'
            ? 'Saving…'
            : save.saveState === 'error'
              ? 'Retry save'
              : save.dirtyCount > 0
                ? `Save · ${save.dirtyCount}`
                : 'Saved'}
        </Button>
      </span>
    )
  }

  return (
    <span aria-live="polite" className="flex shrink-0 items-center font-brandMono text-badge text-theme-muted">
      {save.saveState === 'saving' && 'Saving…'}
      {save.saveState === 'saved' && 'Saved'}
      {save.saveState === 'error' && (
        <button
          type="button"
          onClick={save.flush}
          className="text-brand-red underline-offset-4 hover:underline"
        >
          Couldn&apos;t save · Retry
        </button>
      )}
    </span>
  )
}
