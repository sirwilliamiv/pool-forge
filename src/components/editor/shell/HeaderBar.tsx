'use client'

import Link from 'next/link'
import { ChevronRight, MessageSquare, Play, Share2, Upload } from 'lucide-react'
import { SPECTRUM } from '@/lib/brand'
import { dispatchEphemeral } from '@/lib/commands/dispatch'
import { unresolvedCount } from '@/modules/editor/comments/model'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { SaveStatus } from '@/components/editor/SaveStatus'
import { UndoRedo } from '@/components/editor/shell/UndoRedo'
import { SceneTemplateMenu } from '@/components/editor/shell/SceneTemplateMenu'
import { runExportCommand } from '@/components/exports/ExportCommandHandlers'
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

// Each breadcrumb wears its own hue on hover: a 1px border in one bold colour
// per crumb, cycling through the cool half of the spectrum. Orange and red are
// deliberately absent, they mean warning and error everywhere else in the app,
// and the transparent resting border keeps hover from shifting layout.
const CRUMB =
  'rounded-pfXs border border-transparent px-1.5 py-0.5 hover:bg-rowHover hover:border-[color:var(--crumb-hue)]'

function crumbHue(hue: string): React.CSSProperties {
  return { '--crumb-hue': hue } as React.CSSProperties
}

function initialsFor(user: HeaderBarProps['user']): string {
  const source = user.name ?? user.email ?? 'U'
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const head = parts[0]?.[0] ?? 'U'
  const tail = parts[1]?.[0] ?? ''
  return (head + tail).toUpperCase().slice(0, 2)
}

export function HeaderBar({ orgName, customerName, projectName, projectId, user }: HeaderBarProps) {
  const openNotes = useCommentsStore((s) => unresolvedCount(s.comments))

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
        <Link href="/dashboard" className={CRUMB} style={crumbHue(SPECTRUM.blue)}>
          {orgName ?? 'Pool Forge'}
        </Link>
        <ChevronRight className="h-3 w-3 text-textFaint" />
        {/* The customer lives on the project overview; there is no customer
            page of its own yet. A crumb with a hover state has to go
            somewhere: a span that lights up and does nothing is a lie. */}
        <Link href={`/projects/${projectId}`} className={CRUMB} style={crumbHue(SPECTRUM.purple)}>
          {customerName ?? 'Customer'}
        </Link>
        <ChevronRight className="h-3 w-3 text-textFaint" />
        <Link
          href={`/projects/${projectId}`}
          className={`flex items-center gap-1 font-medium text-foreground ${CRUMB}`}
          style={crumbHue(SPECTRUM.green)}
        >
          {projectName}
          <ChevronRight className="h-3 w-3 -rotate-90 text-textFaint" />
        </Link>
      </nav>

      <SaveStatus />

      {/* Undo has had a working implementation and no way to reach it: no
          button, no shortcut, nothing importing the hotkey table. Deleting the
          wrong pool was permanent. */}
      <UndoRedo />

      <div className="flex-1" />

      <SceneTemplateMenu projectId={projectId} />

      <div className="flex items-center -space-x-1.5" aria-label="Collaborators">
        <span
          className="grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-white bg-sky-500 text-[10px] font-semibold text-white"
          title={user.name ?? user.email ?? 'You'}
        >
          {initialsFor(user)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Kept, and made real, rather than deleted: this is the only place in
            the app that says how many notes are outstanding without opening a
            panel to look. It opens the same list the inspector's icon does. */}
        <button
          type="button"
          onClick={() => dispatchEphemeral('nav.focus', { target: 'comments' })}
          aria-label={
            openNotes > 0 ? `Notes: ${openNotes} open` : 'Notes on this drawing'
          }
          title="Notes on this drawing"
          className="relative grid h-7 w-7 place-items-center rounded-pfSm bg-rowHover text-textMuted hover:bg-borderLight hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {openNotes > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-amber-500 px-[3px] text-[8.5px] font-semibold leading-none text-white">
              {openNotes}
            </span>
          ) : null}
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
            <DropdownMenuItem
              onSelect={() => runExportCommand('export.customerProposal', { projectId })}
            >
              Customer proposal
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                runExportCommand('export.constructionPacket', { projectId, pageSize: 'tabloid' })
              }
            >
              Construction packet (11×17)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runExportCommand('export.sitePlan', { projectId })}>
              Site plan
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => runExportCommand('export.screenEnclosureQuote', { projectId })}
            >
              Screen enclosure quote
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
