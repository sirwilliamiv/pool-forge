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
import { cn } from '@/lib/utils'
import { updateProjectStatus } from '@/modules/projects/actions'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Ready for review',
  PROPOSAL_SENT: 'Proposal sent',
  APPROVED: 'Approved',
  CONSTRUCTION_READY: 'Construction ready',
  ARCHIVED: 'Archived',
}

const STATUS_TONE: Record<ProjectStatus, string> = {
  DRAFT: 'border-muted text-muted-foreground',
  READY_FOR_REVIEW: 'border-amber-300 text-amber-900 bg-amber-50',
  PROPOSAL_SENT: 'border-blue-300 text-blue-900 bg-blue-50',
  APPROVED: 'border-emerald-300 text-emerald-900 bg-emerald-50',
  CONSTRUCTION_READY: 'border-violet-300 text-violet-900 bg-violet-50',
  ARCHIVED: 'border-zinc-300 text-zinc-700 bg-zinc-100',
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
      try {
        await updateProjectStatus(projectId, parsed)
        toast.success(`Status: ${STATUS_LABELS[parsed]}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      }
    })
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={cn(
          'h-8 w-auto gap-1 px-2 text-xs',
          size === 'md' && 'h-9 text-sm',
          STATUS_TONE[status],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
