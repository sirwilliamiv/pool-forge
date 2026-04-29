'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@prisma/client'
import { STATUS_LABELS } from './StatusBadge'

const ORDER: Array<ProjectStatus | 'ALL'> = [
  'ALL',
  'DRAFT',
  'READY_FOR_REVIEW',
  'PROPOSAL_SENT',
  'APPROVED',
  'CONSTRUCTION_READY',
  'ARCHIVED',
]

export function StatusFilter() {
  const params = useSearchParams()
  const current = params.get('status') ?? 'ALL'

  return (
    <div className="flex flex-wrap gap-2">
      {ORDER.map((s) => {
        const href = s === 'ALL' ? '/dashboard' : `/dashboard?status=${s}`
        const label = s === 'ALL' ? 'All' : STATUS_LABELS[s]
        const active = current === s
        return (
          <Link
            key={s}
            href={href}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
