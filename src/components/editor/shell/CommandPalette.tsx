'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { create } from 'zustand'
import { Mic, Plus, Sparkles, Wrench, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { dispatch } from '@/lib/commands/dispatch'
import {
  PALETTE_ROWS,
  asExportCommandId,
  type PaletteRow as PaletteRowDef,
  type PaletteRowContext,
} from '@/lib/commands/palette-rows'
import type { Suggestion } from '@/lib/commands/suggestions'
import { runExportCommand } from '@/components/exports/ExportCommandHandlers'
import type { ExportRouteInput } from '@/modules/exports/routes'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

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

interface PaletteItemModel {
  id: string
  label: string
  description?: string
  shortcut?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

interface CommandPaletteProps {
  suggestions?: Suggestion[]
  /** Required by the export commands — they take the project they document. */
  projectId: string
}

export function CommandPalette({
  suggestions = [],
  projectId,
}: CommandPaletteProps): React.ReactElement {
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
      const result = await dispatch(id, input)
      // A palette row that fails must say so — silent no-ops are how dead
      // commands hid here in the first place.
      if (!result.ok) toast.error(result.error)
      return result
    },
    [close],
  )

  /**
   * Run one declared row.
   *
   * The row builds its own input from the canvas, because the failure this
   * replaces was a row that guessed at the input and sent a shape it had
   * invented. Multi-call rows ("add 2 lights") stop at the first failure rather
   * than reporting two toasts for one click.
   */
  const runRow = useCallback(
    (row: PaletteRowDef, calls: ReturnType<PaletteRowDef['build']>) => {
      if (row.via === 'export') {
        // Inside the click gesture: an awaited round-trip loses the tab to the
        // popup blocker.
        close()
        for (const call of calls) {
          const exportId = asExportCommandId(call.commandId)
          if (exportId) runExportCommand(exportId, call.input as unknown as ExportRouteInput)
        }
        return
      }

      void (async () => {
        close()
        let last: unknown = null
        for (const call of calls) {
          const result = await dispatch(call.commandId, call.input)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          last = result.data
        }
        if (row.successMessage) {
          toast.success(
            typeof row.successMessage === 'function'
              ? row.successMessage(last)
              : row.successMessage,
          )
        }
      })()
    },
    [close],
  )

  // Subscribed, not read once: the staging position of the next object depends
  // on what is already drawn, and the palette can be opened at any point.
  const shapes = useShapesStore((s) => s.shapes)
  const ctx: PaletteRowContext = useMemo(() => ({ shapes, projectId }), [shapes, projectId])

  const rows: Array<{ row: PaletteRowDef; item: PaletteItemModel }> = useMemo(
    () =>
      PALETTE_ROWS.flatMap((row) => {
        const calls = row.build(ctx)
        // Nothing to do right now, so it is not offered. A row that appears is
        // a row that runs.
        if (calls.length === 0) return []
        const item: PaletteItemModel = {
          id: row.id,
          label: row.label,
          icon: row.group === 'add' ? Plus : Zap,
          run: () => runRow(row, calls),
        }
        if (row.description) item.description = row.description
        if (row.shortcut) item.shortcut = row.shortcut
        return [{ row, item }]
      }),
    [ctx, runRow],
  )

  const suggestionRows: PaletteItemModel[] = useMemo(
    () =>
      suggestions.flatMap((s) => {
        // Defence in depth: `getSuggestions` already refuses to emit a
        // suggestion with no command behind it, and a suggestion that reached
        // here without one would be a row that closes the palette and does
        // nothing, which is the single worst outcome in this list.
        if (!s.innerCommandId) return []
        const row: PaletteItemModel = {
          id: s.id,
          label: s.label,
          icon: s.source === 'validation' ? Wrench : Sparkles,
          run: () => {
            void runAndClose('palette.run.suggestion', {
              suggestionId: s.id,
              innerCommandId: s.innerCommandId,
              innerInput: s.innerInput ?? {},
            })
          },
        }
        if (s.description) row.description = s.description
        return [row]
      }),
    [suggestions, runAndClose],
  )

  const addRows = rows.filter((r) => r.row.group === 'add').map((r) => r.item)
  const actionRows = rows.filter((r) => r.row.group === 'action').map((r) => r.item)

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
              {query.trim()
                ? `No commands match “${query.trim()}”.`
                : 'No commands match.'}
            </Command.Empty>

            {suggestionRows.length > 0 && (
              <Group heading="Suggested for this design">
                {suggestionRows.map((row) => (
                  <PaletteItem key={row.id} row={row} />
                ))}
              </Group>
            )}

            {addRows.length > 0 && (
              <Group heading="Add">
                {addRows.map((row) => (
                  <PaletteItem key={row.id} row={row} />
                ))}
              </Group>
            )}

            {actionRows.length > 0 && (
              <Group heading="Actions">
                {actionRows.map((row) => (
                  <PaletteItem key={row.id} row={row} />
                ))}
              </Group>
            )}
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

/**
 * The heading is the small uppercase label, not the rows underneath it.
 *
 * Those styles used to sit on the group itself, so every row inherited them and
 * "Add a waterfall" was rendered in 10px uppercase letter-spaced text, which
 * is also why the first reviewer quoted every row back in capitals.
 */
function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.5px] [&_[cmdk-group-heading]]:text-textFaint"
    >
      {children}
    </Command.Group>
  )
}

function PaletteItem({ row }: { row: PaletteItemModel }) {
  const Icon = row.icon
  return (
    <Command.Item
      value={`${row.label} ${row.description ?? ''}`}
      onSelect={row.run}
      className="flex cursor-pointer items-center gap-2 rounded-pfXs px-2 py-1.5 text-[12px] text-text data-[selected=true]:bg-pfAccentSoft data-[selected=true]:text-pfAccentStrong"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pfXs bg-rowHover text-textMuted data-[selected=true]:bg-white">
        <Icon className="h-3 w-3" />
      </span>
      {/* The label gets its own line. Sharing one with the description put
          "Try PebbleTec Cobalt finish" on screen as the single letter "T". */}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{row.label}</span>
        {row.description && (
          <span className="block truncate text-[11px] text-textFaint">{row.description}</span>
        )}
      </span>
      {row.shortcut && (
        <span className="ml-2 shrink-0 font-mono text-[10px] text-textFaint">{row.shortcut}</span>
      )}
    </Command.Item>
  )
}
