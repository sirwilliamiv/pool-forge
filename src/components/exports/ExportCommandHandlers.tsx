'use client'

import { useEffect } from 'react'
import {
  dispatchEphemeral,
  registerClientHandler,
  unregisterClientHandler,
} from '@/lib/commands/dispatch'
import {
  EXPORT_COMMAND_IDS,
  exportDocumentUrl,
  type ExportCommandId,
  type ExportRouteInput,
} from '@/modules/exports/routes'

/**
 * Client half of the four export commands: open the document route in a new
 * tab. Mount this anywhere export commands can be dispatched from (the editor
 * shell, the project page).
 *
 * Dispatch is ephemeral so `window.open` runs synchronously inside the click
 * gesture — a tab opened after an awaited round-trip gets eaten by popup
 * blockers. The server half still records the `Export` row and the audit row;
 * it just doesn't gate the tab.
 */
export function ExportCommandHandlers() {
  useEffect(() => {
    for (const id of EXPORT_COMMAND_IDS) {
      registerClientHandler<ExportRouteInput, { url: string }>(id, (input) => {
        const url = exportDocumentUrl(id, input)
        window.open(url, '_blank', 'noopener,noreferrer')
        return { url }
      })
    }
    return () => {
      for (const id of EXPORT_COMMAND_IDS) unregisterClientHandler(id)
    }
  }, [])

  return null
}

/** Dispatch an export command from a click handler. */
export function runExportCommand(id: ExportCommandId, input: ExportRouteInput): void {
  void dispatchEphemeral(id, input)
}
