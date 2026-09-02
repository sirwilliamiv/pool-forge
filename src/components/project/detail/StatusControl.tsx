'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Ready for review',
  PROPOSAL_SENT: 'Proposal sent',
  APPROVED: 'Approved',
  CONSTRUCTION_READY: 'Construction ready',
  ARCHIVED: 'Archived',
}

// Same hairline everywhere; only the tint carries the meaning
// (docs/brand-bible.md — "differentiate with tint, not with structure").
const STATUS_TONE: Record<ProjectStatus, string> = {
  DRAFT: 'border-theme-line text-theme-muted bg-theme-bg',
  READY_FOR_REVIEW: 'border-theme-line text-ink-black bg-tint-sand',
  PROPOSAL_SENT: 'border-theme-line text-ink-black bg-tint-paleBlue',
  APPROVED: 'border-theme-line text-ink-black bg-tint-mint',
  CONSTRUCTION_READY: 'border-theme-line text-ink-black bg-tint-lilac',
  ARCHIVED: 'border-theme-line text-theme-faint bg-theme-card',
}

const ALL_STATUSES: ProjectStatus[] = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PROPOSAL_SENT',
  'APPROVED',
  'CONSTRUCTION_READY',
  'ARCHIVED',
]

/**
 * Transitions that change what someone outside the org experiences: what the
 * customer's share link claims, or whether the job reads as live at all.
 */
const SIDE_EFFECTFUL: ReadonlySet<ProjectStatus> = new Set([
  'PROPOSAL_SENT',
  'APPROVED',
  'ARCHIVED',
])

const CONFIRM_COPY: Partial<Record<ProjectStatus, string>> = {
  PROPOSAL_SENT:
    'This marks the proposal as sent to the customer. The dashboard and any shared link will show it as awaiting their answer.',
  APPROVED:
    'This marks the job as approved by the customer. Documents and the dashboard will present it as sold.',
  ARCHIVED:
    'This takes the job off the active pipeline. It stays searchable, and can be unarchived by choosing another status.',
}

/** How long the undo toast in the saveless model stays actionable. */
const UNDO_WINDOW_MS = 6000

/**
 * The one place status is set.
 *
 * `model: 'confirm'` (B1): moves with side effects get a confirmation first,
 * because they change what the customer can see. `model: 'undo'` (B2): every
 * move applies immediately and a toast offers six seconds of undo.
 */
export function StatusControl({
  projectId,
  status,
  model,
}: {
  projectId: string
  status: ProjectStatus
  model: 'confirm' | 'undo'
}) {
  const router = useRouter()
  const [current, setCurrent] = React.useState(status)
  const [confirming, setConfirming] = React.useState<ProjectStatus | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => setCurrent(status), [status])

  const apply = React.useCallback(
    async (next: ProjectStatus, announceUndo: boolean) => {
      const previous = current
      setPending(true)
      setCurrent(next)
      const res = await dispatch<
        { projectId: string; status: ProjectStatus },
        { previousStatus: ProjectStatus }
      >('project.status.set', { projectId, status: next })
      setPending(false)
      if (!res.ok) {
        setCurrent(previous)
        toast.error(res.error)
        return
      }
      router.refresh()
      if (announceUndo) {
        toast(`Status: ${STATUS_LABELS[next]}`, {
          duration: UNDO_WINDOW_MS,
          action: {
            label: 'Undo',
            onClick: () => {
              void dispatch('project.status.set', { projectId, status: previous }).then((undone) => {
                if (undone.ok) {
                  setCurrent(previous)
                  router.refresh()
                  toast(`Back to ${STATUS_LABELS[previous]}`)
                } else {
                  toast.error(undone.error)
                }
              })
            },
          },
        })
      } else {
        toast.success(`Status: ${STATUS_LABELS[next]}`)
      }
    },
    [current, projectId, router],
  )

  function choose(next: ProjectStatus) {
    if (next === current) return
    if (model === 'confirm' && SIDE_EFFECTFUL.has(next)) {
      setConfirming(next)
      return
    }
    void apply(next, model === 'undo')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Status: ${STATUS_LABELS[current]}. Change status`}
            className={cn(
              'flex h-7 items-center gap-1 rounded-brand border px-2.5 font-brandMono text-badge uppercase transition-colors duration-brand ease-brand disabled:opacity-60',
              STATUS_TONE[current],
            )}
          >
            {STATUS_LABELS[current]}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="border-theme-line bg-theme-bg text-theme-fg">
          {ALL_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => choose(s)}
              className={cn('focus:bg-theme-card focus:text-theme-fg', s === current && 'font-semibold')}
            >
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null) }}>
        <DialogContent className="border-theme-line bg-theme-bg">
          <DialogHeader>
            <DialogTitle className="text-title3 font-medium">
              {confirming ? `Move to ${STATUS_LABELS[confirming]}?` : ''}
            </DialogTitle>
            <DialogDescription className="text-bodyL text-theme-muted">
              {confirming ? CONFIRM_COPY[confirming] : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const next = confirming
                setConfirming(null)
                if (next) void apply(next, false)
              }}
            >
              {confirming ? STATUS_LABELS[confirming] : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
