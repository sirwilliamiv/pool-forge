'use client'

import Link from 'next/link'
import { ChevronRight, MessageSquare, Play, Share2, Upload } from 'lucide-react'
import { SaveStatus } from '@/components/editor/SaveStatus'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface HeaderBarProps {
  orgName?: string | null | undefined
  customerName?: string | null | undefined
  projectName: string
  projectId: string
  user: {
    name?: string | null | undefined
    email?: string | null | undefined
    image?: string | null | undefined
  }
}

function initialsFor(user: HeaderBarProps['user']): string {
  const source = user.name ?? user.email ?? 'U'
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const head = parts[0]?.[0] ?? 'U'
  const tail = parts[1]?.[0] ?? ''
  return (head + tail).toUpperCase().slice(0, 2)
}

export function HeaderBar({ orgName, customerName, projectName, projectId, user }: HeaderBarProps) {
  return (
    <header className="z-50 flex h-11 items-center gap-3 border-b border-borderLight bg-white px-3">
      <Link
        href="/dashboard"
        className="grid h-7 w-7 place-items-center rounded-pfSm bg-gradient-to-br from-sky-500 to-cyan-500 text-[11px] font-semibold text-white"
        aria-label="Pool Forge dashboard"
      >
        PF
      </Link>

      <nav className="flex items-center gap-1 text-[12px] text-textMuted">
        <span className="rounded-pfXs px-1.5 py-0.5 hover:bg-rowHover">{orgName ?? 'Pool Forge'}</span>
        <ChevronRight className="h-3 w-3 text-textFaint" />
        <span className="rounded-pfXs px-1.5 py-0.5 hover:bg-rowHover">{customerName ?? 'Customer'}</span>
        <ChevronRight className="h-3 w-3 text-textFaint" />
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center gap-1 rounded-pfXs px-1.5 py-0.5 font-medium text-foreground hover:bg-rowHover"
        >
          {projectName}
          <ChevronRight className="h-3 w-3 -rotate-90 text-textFaint" />
        </Link>
      </nav>

      <SaveStatus />

      <div className="flex-1" />

      <div className="flex items-center -space-x-1.5" aria-label="Collaborators">
        <span
          className="grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-white bg-sky-500 text-[10px] font-semibold text-white"
          title={user.name ?? user.email ?? 'You'}
        >
          {initialsFor(user)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Comments (coming soon)"
          title="Comments — coming soon"
          disabled
          className="grid h-7 w-7 place-items-center rounded-pfSm bg-rowHover text-textMuted opacity-40"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Sun study (coming soon)"
          title="Sun study — coming soon"
          disabled
          className="grid h-7 w-7 place-items-center rounded-pfSm bg-rowHover text-textMuted opacity-40"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Export document"
              title="Export document"
              className="grid h-7 w-7 place-items-center rounded-pfSm bg-rowHover text-textMuted hover:bg-borderLight hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Export document</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={`/projects/${projectId}/proposal`} target="_blank" rel="noopener noreferrer">
                Customer proposal
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/projects/${projectId}/construction`} target="_blank" rel="noopener noreferrer">
                Construction packet
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/projects/${projectId}/site-plan`} target="_blank" rel="noopener noreferrer">
                Site plan
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`/projects/${projectId}/screen-enclosure-quote`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Screen enclosure quote
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        title="Share link — coming soon"
        disabled
        className="inline-flex h-7 items-center gap-1.5 rounded-pfSm bg-pfAccent px-3 text-[12px] font-medium text-white opacity-50"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>
    </header>
  )
}
