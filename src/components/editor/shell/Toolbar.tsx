'use client'

import {
  ChevronDown,
  Hand,
  Lightbulb,
  MessageSquare,
  MousePointer2,
  PaintBucket,
  Ruler,
  Sparkles,
  StretchHorizontal,
  Type,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { PoolShapePicker } from './PoolShapePicker'

interface ToolItem {
  id: string
  icon: LucideIcon
  label: string
  shortcut?: string
  hasChevron?: boolean
  group: 'create' | 'surface' | 'annotate' | 'ai'
}

const TOOLS: ToolItem[] = [
  { id: 'tool.select', icon: MousePointer2, label: 'Move', shortcut: 'V', group: 'create' },
  { id: 'tool.steps', icon: StretchHorizontal, label: 'Steps & shelves', shortcut: 'S', group: 'create' },
  { id: 'tool.water-feature', icon: Waves, label: 'Water feature', shortcut: 'W', group: 'create' },
  { id: 'tool.lights', icon: Lightbulb, label: 'Lights', shortcut: 'L', group: 'create' },
  { id: 'tool.deck', icon: Hand, label: 'Deck', shortcut: 'D', group: 'surface' },
  { id: 'tool.material-brush', icon: PaintBucket, label: 'Material brush', shortcut: 'B', group: 'surface' },
  { id: 'tool.measure', icon: Ruler, label: 'Measure', shortcut: 'M', group: 'annotate' },
  { id: 'tool.annotation', icon: Type, label: 'Annotation', shortcut: 'T', group: 'annotate' },
  { id: 'tool.comment', icon: MessageSquare, label: 'Comment', shortcut: 'C', group: 'annotate' },
]

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  return (
    <div
      className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border bg-white p-1 shadow-pfLg"
      role="toolbar"
      aria-label="Editor tools"
    >
      {renderGroup('create').slice(0, 1)}
      <PoolShapePicker />
      {renderGroup('create').slice(1)}
      <Divider />
      {renderGroup('surface')}
      <Divider />
      {renderGroup('annotate')}
      <Divider />
      {/* Labelled, because an unlabelled sparkle is not a label. This is the
          only place a new user is told that adding a waterfall, exporting a
          proposal and running the checklist all live behind one button, and the
          first person to try the product read it as decoration and missed it. */}
      <button
        type="button"
        onClick={() => void dispatch('palette.open', {})}
        title="Commands: add features, export documents, run the checklist (⌘K)"
        aria-label="Open the command palette"
        aria-keyshortcuts="Meta+K Control+K"
        className="ml-0.5 flex h-9 items-center gap-1.5 rounded-pfSm bg-gradient-to-br from-fuchsia-500 to-pink-500 pl-2 pr-2.5 text-white shadow-pfSm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-pfAccent"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-[11.5px] font-medium leading-none">Commands</span>
        <span className="font-mono text-[9px] leading-none text-white/80">⌘K</span>
      </button>
    </div>
  )

  function renderGroup(group: ToolItem['group']) {
    return TOOLS.filter((t) => t.group === group).map((tool) => {
      const Icon = tool.icon
      const active = activeTool === tool.id
      return (
        <button
          key={tool.id}
          type="button"
          onClick={() => setActiveTool(tool.id)}
          title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
          aria-label={tool.label}
          aria-pressed={active}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-pfSm transition focus:outline-none focus:ring-2 focus:ring-pfAccent',
            active
              ? 'bg-foreground text-white'
              : 'text-textMuted hover:bg-rowHover hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {tool.shortcut && (
            <span
              className={cn(
                'pointer-events-none absolute bottom-0.5 right-0.5 font-mono text-[8px]',
                active ? 'text-white/70' : 'text-textFaint',
              )}
            >
              {tool.shortcut}
            </span>
          )}
          {tool.hasChevron && (
            <ChevronDown
              className={cn(
                'pointer-events-none absolute -bottom-0.5 right-0.5 h-2.5 w-2.5',
                active ? 'text-white/70' : 'text-textFaint',
              )}
              aria-hidden
            />
          )}
        </button>
      )
    })
  }
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-borderLight" aria-hidden />
}
