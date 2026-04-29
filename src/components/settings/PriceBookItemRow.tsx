'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteItem } from '@/app/(app)/settings/price-book/actions'
import { PriceBookItemDialog, type ExistingItem } from './PriceBookItemDialog'

export interface PriceBookItemRowProps {
  item: ExistingItem
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function PriceBookItemRow({ item }: PriceBookItemRowProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deleteItem(item.id)
        toast.success('Item deleted')
      } catch (err) {
        toast.error((err as Error).message ?? 'Failed to delete')
      }
    })
  }

  const flags: string[] = []
  if (!item.customerVisible) flags.push('hidden')
  if (item.internalOnly) flags.push('internal')
  if (item.required) flags.push('required')
  if (item.upgradeOnly) flags.push('upgrade')

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/40">
        <td className="px-3 py-2 font-medium">{item.name}</td>
        <td className="px-3 py-2 text-muted-foreground">{item.unitType}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmt.format(item.unitCost)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmt.format(item.retailPrice)}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
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
