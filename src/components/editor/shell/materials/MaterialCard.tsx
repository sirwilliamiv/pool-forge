'use client'

import { dispatch } from '@/lib/commands/dispatch'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { toast } from 'sonner'
import type { MaterialView } from './MaterialGrid'

interface MaterialCardProps {
  view: MaterialView
}

export function MaterialCard({ view }: MaterialCardProps) {
  const { material, priceLabel, unpricedNote, slotLabel } = view
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const activeMaterialId = useEditorStore((s) => s.activeMaterialId)
  const setActiveMaterial = useEditorStore((s) => s.setActiveMaterial)
  const isActive = activeMaterialId === material.id

  async function handleClick() {
    // Only a finish can be applied to a shape: a material with no slot is a
    // canvas fill, and pretending to apply one was another way of reporting a
    // change nobody could see.
    if (selectedId && material.slot) {
      const result = await dispatch('pool.material.set', {
        id: selectedId,
        slot: material.slot,
        materialId: material.id,
      })
      if (result.ok) {
        toast.success(`${material.name} applied`)
      } else {
        toast.error(result.error)
      }
      return
    }
    setActiveMaterial(isActive ? null : material.id)
    toast.message(
      isActive
        ? 'Material cleared'
        : material.slot
          ? `${material.name} ready — select the pool to apply`
          : `${material.name} is a surface fill, not a pool finish`,
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleClick()
      }}
      className={
        'flex w-full items-center gap-2 rounded-pfSm border px-2 py-1.5 text-left transition-colors hover:bg-rowHover ' +
        (isActive
          ? 'border-pfAccent bg-pfAccentSoft'
          : 'border-borderLight bg-white')
      }
      title={
        unpricedNote ??
        (selectedId && material.slot
          ? `Apply ${material.name} to the pool`
          : `Set ${material.name} as the active material`)
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
        {material.brand ?? slotLabel ? (
          <div className="mt-0.5 truncate text-[10px] text-textMuted">
            {material.brand ?? slotLabel}
          </div>
        ) : null}
      </div>
      {priceLabel ? (
        <div className="shrink-0 text-[10.5px] tabular-nums text-textMuted">
          {priceLabel}
        </div>
      ) : unpricedNote ? (
        <div className="shrink-0 text-[10.5px] text-pfWarn">Not priced</div>
      ) : null}
    </button>
  )
}
