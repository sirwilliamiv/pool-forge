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

// Tint, not structure, is what tells statuses apart (docs/brand-bible.md) —
// every pill is the same shape, and only its tint family changes. These read
// as data rather than prose, so the badge takes the mono metadata scale.
const STATUS_TONE: Record<ProjectStatus, string> = {
  DRAFT: 'bg-theme-card text-theme-muted',
  READY_FOR_REVIEW: 'bg-tint-sand text-ink-black',
  PROPOSAL_SENT: 'bg-tint-paleBlue text-ink-black',
  APPROVED: 'bg-tint-mint text-ink-black',
  CONSTRUCTION_READY: 'bg-tint-lilac text-ink-black',
  ARCHIVED: 'bg-theme-card text-theme-faint',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-brandMono text-badge uppercase',
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export const STATUS_LABELS = STATUS_LABEL
