'use client'

import { dispatch } from '@/lib/commands/dispatch'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { toast } from 'sonner'
import type { MaterialView } from './MaterialGrid'

interface MaterialCardProps {
  material: MaterialView
}

export function MaterialCard({ material }: MaterialCardProps) {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const activeMaterialId = useEditorStore((s) => s.activeMaterialId)
  const setActiveMaterial = useEditorStore((s) => s.setActiveMaterial)
  const isActive = activeMaterialId === material.id

  async function handleClick() {
    if (selectedId) {
      const result = await dispatch('pool.material.set', {
        id: selectedId,
        slot: material.slot ?? 'interior',
        materialId: material.id,
      })
      if (result.ok) {
        toast.success(`${material.name} applied`)
      } else {
        toast.error(`Couldn't apply: ${result.error}`)
      }
    } else {
      setActiveMaterial(isActive ? null : material.id)
      toast.message(
        isActive
          ? 'Material cleared'
          : `${material.name} ready — select a shape to apply`,
      )
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        'flex w-full items-center gap-2 rounded-pfSm border px-2 py-1.5 text-left transition-colors hover:bg-rowHover ' +
        (isActive
          ? 'border-pfAccent bg-pfAccentSoft'
          : 'border-borderLight bg-white')
      }
      title={
        selectedId
          ? `Apply ${material.name} to selection`
          : `Set ${material.name} as active material`
      }
    >
      <div
        className="h-7 w-7 shrink-0 rounded-pfXs border border-borderLight"
        style={{ background: material.swatch }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium leading-tight text-foreground">
          {material.name}
        </div>
        {material.brand ? (
          <div className="mt-0.5 truncate text-[10px] text-textMuted">
            {material.brand}
          </div>
        ) : null}
      </div>
      {material.costLabel ? (
        <div className="shrink-0 text-[10.5px] tabular-nums text-textMuted">
          {material.costLabel}
        </div>
      ) : null}
    </button>
  )
}
