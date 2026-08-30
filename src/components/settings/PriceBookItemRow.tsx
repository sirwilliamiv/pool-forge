'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dispatch } from '@/lib/commands/dispatch'
import { optionLabel } from '@/modules/pricing/engine'
import { PriceBookItemDialog, type ExistingItem } from './PriceBookItemDialog'

export interface PriceBookItemRowProps {
  item: ExistingItem
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function PriceBookItemRow({ item }: PriceBookItemRowProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await dispatch('pricebook.item.remove', { itemId: item.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Item deleted')
      router.refresh()
    })
  }

  const flags: string[] = []
  if (!item.customerVisible) flags.push('hidden')
  if (item.internalOnly) flags.push('internal')
  if (item.required) flags.push('required')
  if (item.upgradeOnly) flags.push('upgrade')
  // Which selection switches this line on, spelled out. A builder looking at a
  // heater and a salt cell in the same category needs to see at a glance which
  // one is tied to which answer, because the failure this fixed was invisible
  // from the price book: both lines looked identical and both billed together.
  if (item.optionKey) flags.push(`only with ${optionLabel(item.optionKey).toLowerCase()}`)

  return (
    <>
      <tr className="border-b border-theme-line last:border-0 hover:bg-theme-card">
        <td className="px-3 py-2 font-medium text-theme-fg">{item.name}</td>
        <td className="px-3 py-2 font-brandMono tracking-[0.5px] text-theme-muted">
          {item.unitType}
        </td>
        <td className="px-3 py-2 text-right font-brandMono tabular-nums tracking-[0.5px] text-theme-fg">
          {fmt.format(item.unitCost)}
        </td>
        <td className="px-3 py-2 text-right font-brandMono tabular-nums tracking-[0.5px] text-theme-fg">
          {fmt.format(item.retailPrice)}
        </td>
        <td className="px-3 py-2 font-brandMono text-formLabel tracking-[0.5px] text-theme-muted">
          {flags.length ? flags.join(' · ') : '—'}
        </td>
        <td className="px-3 py-2 text-right">
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={pending}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
      <PriceBookItemDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={item}
      />
    </>
  )
}
