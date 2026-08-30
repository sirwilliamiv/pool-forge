'use client'

import { useTransition } from 'react'
import { ProjectStatus } from '@prisma/client'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<ProjectStatus, string> = {
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
  ProjectStatus.DRAFT,
  ProjectStatus.READY_FOR_REVIEW,
  ProjectStatus.PROPOSAL_SENT,
  ProjectStatus.APPROVED,
  ProjectStatus.CONSTRUCTION_READY,
  ProjectStatus.ARCHIVED,
]

export interface StatusDropdownProps {
  projectId: string
  status: ProjectStatus
  size?: 'sm' | 'md'
}

export function StatusDropdown({ projectId, status, size = 'sm' }: StatusDropdownProps) {
  const [pending, startTransition] = useTransition()

  function onChange(next: string) {
    if (next === status) return
    const parsed = next as ProjectStatus
    startTransition(async () => {
      const result = await dispatch('project.status.set', { projectId, status: parsed })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Status: ${STATUS_LABELS[parsed]}`)
    })
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={cn(
          'h-8 w-auto gap-1 rounded-brand px-2 text-bodyS ring-offset-theme-bg focus:ring-theme-fg',
          size === 'md' && 'h-9 text-bodyL',
          STATUS_TONE[status],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-theme-line bg-theme-bg text-theme-fg shadow-elevation1">
        {ALL_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="focus:bg-theme-card focus:text-theme-fg">
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
