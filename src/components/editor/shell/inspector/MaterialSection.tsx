'use client'

import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMaterialsStore } from '@/modules/editor/state/materialsStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { isPolygonPool, isPool, type Shape } from '@/modules/editor/state/shapes'
import {
  FINISH_SLOTS,
  SLOT_LABEL,
  defaultOptionFor,
  optionFor,
  optionsForSlot,
  type FinishOption,
  type FinishSlot,
} from '@/modules/materials/catalog'

/**
 * The finish rows: what this pool's interior, coping and waterline tile are.
 *
 * Two things used to be wrong here and they compounded. The selected value was
 * local component state, so it reset to the top of the list on every reload and
 * the builder's choice appeared to have been thrown away — it had been written
 * to the shape, but nothing read it back. And the price beside each name came
 * out of the material row's own `costPerSqft`, a second price list that no
 * quote had ever charged: the panel said `Travertine — Ivory $28.00/lf` while
 * the quote billed $42.00/lf for the same coping.
 *
 * Now the value is read from the shape and the price is read from the price
 * book, so the row cannot show a number the quote will not bill. A finish the
 * price book has no line for says so in place of a price.
 */

/** The pool the finish rows apply to. Only a pool has an interior. */
function poolFor(shapes: readonly Shape[], selectedId: string | undefined): Shape | null {
  if (!selectedId) return null
  const selected = shapes.find((shape) => shape.id === selectedId)
  if (!selected) return null
  return isPool(selected) || isPolygonPool(selected) ? selected : null
}

function Swatch({ background, size }: { background: string; size: 'row' | 'menu' }) {
  return (
    <div
      className={
        (size === 'row' ? 'h-7 w-7' : 'h-4 w-4') +
        ' shrink-0 rounded-pfXs border border-borderLight'
      }
      style={{ background }}
      aria-hidden
    />
  )
}

function FinishRow({
  slot,
  shapeId,
  options,
  current,
}: {
  slot: FinishSlot
  shapeId: string
  options: FinishOption[]
  current: FinishOption
}) {
  async function commit(materialId: string) {
    if (materialId === current.material.id) return
    const result = await dispatch('pool.material.set', { id: shapeId, slot, materialId })
    if (!result.ok) toast.error(result.error)
  }

  const priceLabel = current.price?.label ?? 'Not in price book'

  return (
    <section className="border-b border-borderLight">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
          {SLOT_LABEL[slot]}
        </h4>
      </header>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="m-3 mt-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-pfSm border border-borderLight bg-white p-2 text-left hover:bg-rowHover focus:outline-none focus:ring-2 focus:ring-pfAccent"
          >
            <Swatch background={current.material.swatch} size="row" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-medium leading-tight text-foreground">
                {current.material.name}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-textMuted">
                {current.material.brand ?? current.price?.itemName ?? SLOT_LABEL[slot]}
              </div>
            </div>
            <div
              className={
                'shrink-0 text-[11.5px] tabular-nums ' +
                (current.price ? 'text-foreground' : 'text-pfWarn')
              }
            >
              {priceLabel}
            </div>
            <ChevronDown className="h-3 w-3 shrink-0 text-textFaint" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.material.id}
              onSelect={() => {
                void commit(option.material.id)
              }}
              className="flex items-center gap-2"
            >
              <Swatch background={option.material.swatch} size="menu" />
              <span className="min-w-0 flex-1 truncate text-[11.5px]">
                {option.material.name}
              </span>
              <span
                className={
                  'shrink-0 text-[10.5px] tabular-nums ' +
                  (option.price ? 'text-textMuted' : 'text-pfWarn')
                }
              >
                {option.price?.label ?? 'Not in price book'}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Said where the choice is made, not buried on the quote. A finish with
          no price-book line is a real choice that bills nothing, and the moment
          to know that is before it is shown to a customer. */}
      {current.unpricedReason ? (
        <p className="px-3 pb-2 text-[10px] leading-snug text-pfWarn">
          {current.unpricedReason}
        </p>
      ) : null}
    </section>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <section className="border-b border-borderLight">
      <header className="px-3 pb-1 pt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
          Material
        </h4>
      </header>
      <div className="px-3 py-2 text-[11px] text-textFaint">{message}</div>
    </section>
  )
}

export function MaterialSection() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const shapes = useShapesStore((s) => s.shapes)
  const catalog = useMaterialsStore((s) => s.catalog)

  const pool = useMemo(() => poolFor(shapes, selectedId), [shapes, selectedId])

  const rows = useMemo(() => {
    if (!pool) return []
    return FINISH_SLOTS.flatMap((slot) => {
      const options = optionsForSlot(catalog, slot)
      if (options.length === 0) return []
      // The chosen material only counts for the slot it belongs to. A material
      // id left on a shape by an older build — a waterline tile recorded as an
      // interior finish, which the old picker allowed — falls back to the slot
      // default rather than quietly pricing a linear foot as a square one.
      const chosenId = pool.materials?.[slot]
      const chosen = chosenId ? optionFor(catalog, chosenId) : null
      const current = chosen?.material.slot === slot ? chosen : defaultOptionFor(catalog, slot)
      if (!current) return []
      return [{ slot, options, current }]
    })
  }, [pool, catalog])

  if (!selectedId) return <Empty message="No selection" />
  if (!pool) return <Empty message="Finishes are chosen on the pool." />
  if (catalog.materials.length === 0) {
    return <Empty message="No materials in this organisation yet." />
  }
  if (rows.length === 0) {
    return <Empty message="No finishes in this organisation's material catalogue." />
  }

  return (
    <>
      {rows.map((row) => (
        <FinishRow
          key={row.slot}
          slot={row.slot}
          shapeId={selectedId}
          options={row.options}
          current={row.current}
        />
      ))}
    </>
  )
}
