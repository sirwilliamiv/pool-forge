'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { create } from 'zustand'
import { Mic, Plus, Sparkles, Wrench, Zap } from 'lucide-react'
import { dispatch } from '@/lib/commands/dispatch'
import type { Suggestion } from '@/lib/commands/suggestions'

interface PaletteState {
  open: boolean
  initialQuery: string
  setOpen(open: boolean, initialQuery?: string): void
}

export const useCommandPaletteStore = create<PaletteState>((set) => ({
  open: false,
  initialQuery: '',
  setOpen: (open, initialQuery = '') => set({ open, initialQuery: open ? initialQuery : '' }),
}))

export function openCommandPalette(initialQuery?: string): void {
  useCommandPaletteStore.getState().setOpen(true, initialQuery)
}

interface PaletteRow {
  id: string
  label: string
  description?: string
  shortcut?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

interface CommandPaletteProps {
  suggestions?: Suggestion[]
}

export function CommandPalette({ suggestions = [] }: CommandPaletteProps): React.ReactElement {
  const open = useCommandPaletteStore((s) => s.open)
  const initialQuery = useCommandPaletteStore((s) => s.initialQuery)
  const setOpen = useCommandPaletteStore((s) => s.setOpen)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery(initialQuery)
  }, [open, initialQuery])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useCommandPaletteStore.getState().open)
      } else if (e.key === 'Escape' && useCommandPaletteStore.getState().open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const close = useCallback(() => setOpen(false), [setOpen])

  const runAndClose = useCallback(
    async (id: string, input: unknown) => {
      close()
      await dispatch(id, input)
    },
    [close],
  )

  const suggestionRows: PaletteRow[] = useMemo(
    () =>
      suggestions.map((s) => {
        const row: PaletteRow = {
          id: s.id,
          label: s.label,
          icon: s.source === 'validation' ? Wrench : Sparkles,
          run: () => {
            if (s.innerCommandId) {
              void runAndClose('palette.run.suggestion', {
                suggestionId: s.id,
                innerCommandId: s.innerCommandId,
                innerInput: s.innerInput ?? {},
              })
            } else {
              close()
            }
          },
        }
        if (s.description) row.description = s.description
        return row
      }),
    [suggestions, runAndClose, close],
  )

  const addRows: PaletteRow[] = useMemo(
    () => [
      {
        id: 'add.shape.tanning-ledge',
        label: 'Add a tanning ledge',
        icon: Plus,
        run: () => void runAndClose('add.shape', { kind: 'tanning-ledge' }),
      },
      {
        id: 'add.shape.waterfall',
        label: 'Add a waterfall',
        icon: Plus,
        run: () => void runAndClose('add.shape', { kind: 'waterfall' }),
      },
      {
        id: 'add.shape.led-light',
        label: 'Add 2 LED lights',
        icon: Plus,
        run: () => void runAndClose('add.shape', { kind: 'led-light', quantity: 2 }),
      },
      {
        id: 'add.shape.rectangle-pool',
        label: 'Add a rectangle pool',
        icon: Plus,
        run: () => void runAndClose('add.shape', { kind: 'rectangle-pool' }),
      },
    ],
    [runAndClose],
  )

  const actionRows: PaletteRow[] = useMemo(
    () => [
      {
        id: 'action.export.proposal',
        label: 'Export customer proposal',
        shortcut: '⌘E',
        icon: Zap,
        run: () => void runAndClose('export.customerProposal', {}),
      },
      {
        id: 'action.export.construction',
        label: 'Export construction packet',
        shortcut: '⌘⇧E',
        icon: Zap,
        run: () => void runAndClose('export.constructionPacket', {}),
      },
      {
        id: 'action.run.validation',
        label: 'Run validation',
        icon: Zap,
        run: () => void runAndClose('run.validation', {}),
      },
      {
        id: 'action.camera.iso',
        label: 'Reset camera to isometric',
        icon: Zap,
        run: () => void runAndClose('camera.set.view', { view: 'iso' }),
      },
    ],
    [runAndClose],
  )

  if (!open) return <></>

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      style={{ pointerEvents: 'auto' }}
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        className="relative mt-[110px] w-[580px] overflow-hidden rounded-pfMd bg-white shadow-pfLg"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" loop shouldFilter>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command or search…"
            className="h-[50px] w-full border-b border-borderLight bg-transparent px-4 text-[14px] outline-none placeholder:text-textFaint"
          />
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-[12px] text-textMuted">
              No commands match.
            </Command.Empty>

            {suggestionRows.length > 0 && (
              <Command.Group
                heading="Suggested for this design"
                className="text-[10px] font-medium uppercase tracking-[0.5px] text-textFaint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
              >
                {suggestionRows.map((row) => (
                  <PaletteItem key={row.id} row={row} />
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Add"
              className="text-[10px] font-medium uppercase tracking-[0.5px] text-textFaint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
            >
              {addRows.map((row) => (
                <PaletteItem key={row.id} row={row} />
              ))}
            </Command.Group>

            <Command.Group
              heading="Actions"
              className="text-[10px] font-medium uppercase tracking-[0.5px] text-textFaint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
            >
              {actionRows.map((row) => (
                <PaletteItem key={row.id} row={row} />
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-borderLight px-4 py-2 text-[11px] text-textMuted">
            <div className="flex gap-3">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">⏎</kbd> select</span>
              <span><kbd className="font-mono">esc</kbd> close</span>
            </div>
            <button
              type="button"
              disabled
              aria-label="Hold space to dictate (coming soon)"
              className="flex items-center gap-1.5 text-pfAccent disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Mic className="h-3 w-3" />
              <span>Hold space to dictate</span>
            </button>
          </div>
        </Command>
      </div>
    </div>
  )
}

function PaletteItem({ row }: { row: PaletteRow }) {
  const Icon = row.icon
  return (
    <Command.Item
      value={`${row.label} ${row.description ?? ''}`}
      onSelect={row.run}
      className="flex h-[30px] cursor-pointer items-center gap-2 rounded-pfXs px-2 text-[12px] text-text data-[selected=true]:bg-pfAccentSoft data-[selected=true]:text-pfAccentStrong"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-pfXs bg-rowHover text-textMuted data-[selected=true]:bg-white">
        <Icon className="h-3 w-3" />
      </span>
      <span className="flex-1 truncate">{row.label}</span>
      {row.description && (
        <span className="truncate text-[11px] text-textFaint">{row.description}</span>
      )}
      {row.shortcut && (
        <span className="ml-2 font-mono text-[10px] text-textFaint">{row.shortcut}</span>
      )}
    </Command.Item>
  )
}
