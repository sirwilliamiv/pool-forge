import type { ProjectStatus } from '@prisma/client'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Ready for review',
  PROPOSAL_SENT: 'Proposal sent',
  APPROVED: 'Approved',
  CONSTRUCTION_READY: 'Construction ready',
  ARCHIVED: 'Archived',
}

const STATUS_TONE: Record<ProjectStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  READY_FOR_REVIEW: 'bg-amber-100 text-amber-900',
  PROPOSAL_SENT: 'bg-blue-100 text-blue-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  CONSTRUCTION_READY: 'bg-violet-100 text-violet-900',
  ARCHIVED: 'bg-zinc-200 text-zinc-700',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export const STATUS_LABELS = STATUS_LABEL
