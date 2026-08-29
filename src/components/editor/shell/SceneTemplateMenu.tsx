'use client'

import { Layers, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { dispatch } from '@/lib/commands/dispatch'
import { loadDrawing } from '@/modules/editor/persistence'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

// Saved scenes.
//
// Five `template.scene.*` commands were registered and nothing in the app called
// any of them, so a feature that exists end to end in the backend was reachable
// only by voice. This is the rest of it.

export interface SceneTemplateMenuProps {
  projectId: string
}

interface TemplateSummary {
  id: string
  name: string
  description: string | null
  objectCount: number
  isDefault: boolean
}

export function SceneTemplateMenu({ projectId }: SceneTemplateMenuProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const result = await dispatch<Record<string, never>, { templates: TemplateSummary[] }>(
      'template.scene.list',
      {},
    )
    if (result.ok) setTemplates(result.data.templates)
    setLoaded(true)
  }, [])

  // Loaded when the menu is first opened rather than on mount: most editor
  // sessions never touch templates, and this is a round trip on every page load.
  const onOpenChange = (open: boolean) => {
    if (open && !loaded) void refresh()
  }

  async function save() {
    const shapes = useShapesStore.getState().shapes
    if (shapes.length === 0) {
      toast.error('There is nothing on this sheet to save.')
      return
    }

    const name = window.prompt('Name this scene', 'Standard backyard')?.trim()
    if (!name) return

    setBusy(true)
    const result = await dispatch<
      { projectId: string; name: string; overwrite: boolean },
      { objectCount: number }
    >('template.scene.save', { projectId, name, overwrite: false })
    setBusy(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Saved "${name}" with ${result.data.objectCount} objects.`)
    void refresh()
  }

  async function apply(template: TemplateSummary) {
    const existing = useShapesStore.getState().shapes.length

    // Replacing is the destructive path, so it is the one that asks. Merging
    // into a drawing is undoable and does not need a prompt.
    const replace =
      existing > 0 &&
      window.confirm(
        `Replace the ${existing} object${existing === 1 ? '' : 's'} on this sheet with "${template.name}"?\n\nCancel to add the template alongside them instead.`,
      )

    setBusy(true)
    const result = await dispatch<
      { projectId: string; templateId: string; mode: 'merge' | 'replace'; confirmReplace: boolean },
      { added: number; total: number; replaced: number }
    >('template.scene.apply', {
      projectId,
      templateId: template.id,
      mode: replace ? 'replace' : 'merge',
      confirmReplace: replace,
    })

    if (!result.ok) {
      setBusy(false)
      toast.error(result.error)
      return
    }

    // The command writes the drawing server-side, so the store is now stale.
    // Reloading is what makes the canvas agree with the database; without it the
    // next autosave would write the old shapes straight back over the template.
    try {
      const drawing = await loadDrawing(projectId)
      useShapesStore.getState()._replaceShapes(drawing.shapes ?? [])
      toast.success(
        replace
          ? `Replaced the sheet with "${template.name}".`
          : `Added ${result.data.added} object${result.data.added === 1 ? '' : 's'} from "${template.name}".`,
      )
    } catch {
      toast.error('Applied, but the canvas could not be refreshed. Reload the page.')
    } finally {
      setBusy(false)
    }
  }

  async function setDefault(template: TemplateSummary) {
    setBusy(true)
    const result = await dispatch('template.scene.setDefault', { templateId: template.id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`New projects will start from "${template.name}".`)
    void refresh()
  }

  async function remove(template: TemplateSummary) {
    if (!window.confirm(`Delete the scene template "${template.name}"? This cannot be undone.`)) return

    setBusy(true)
    const result = await dispatch('template.scene.delete', { templateId: template.id, confirm: true })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Deleted "${template.name}".`)
    void refresh()
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-pfSm px-2 text-[12px] text-textMuted transition hover:bg-rowHover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent"
          aria-label="Scene templates"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Layers className="h-3.5 w-3.5" aria-hidden />
          )}
          Scenes
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-y-auto">
        <DropdownMenuItem onSelect={() => void save()}>Save this scene as a template…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Start from a saved scene</DropdownMenuLabel>

        {!loaded && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
        {loaded && templates.length === 0 && (
          <DropdownMenuItem disabled>No saved scenes yet.</DropdownMenuItem>
        )}

        {templates.map(template => (
          <DropdownMenuItem
            key={template.id}
            onSelect={() => void apply(template)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-medium">
              {template.name}
              {template.isDefault && <span className="ml-1.5 text-[10px] text-textFaint">default</span>}
            </span>
            <span className="text-[11px] text-textFaint">
              {template.objectCount} object{template.objectCount === 1 ? '' : 's'}
              {template.description ? ` · ${template.description}` : ''}
            </span>
          </DropdownMenuItem>
        ))}

        {templates.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Manage</DropdownMenuLabel>
            {templates.map(template => (
              <div key={`manage-${template.id}`} className="flex items-center gap-1 px-2 py-1">
                <span className="flex-1 truncate text-[11.5px] text-textMuted">{template.name}</span>
                {!template.isDefault && (
                  <button
                    type="button"
                    onClick={() => void setDefault(template)}
                    className="rounded-pfXs px-1.5 py-0.5 text-[10.5px] text-textMuted hover:bg-rowHover hover:text-foreground"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(template)}
                  className="rounded-pfXs px-1.5 py-0.5 text-[10.5px] text-textMuted hover:bg-rowHover hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
