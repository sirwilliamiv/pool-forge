'use client'

// Money on one job that no drawing measures.
//
// A retaining wall, a fence run, a permit fee, a panel upgrade. The price book
// happily accepted all four and the quote billed none of them, because the
// engine asks a category for a quantity and lanai, fence, wall, electrical and
// other have nothing to answer with. A builder entered "Paver retaining wall
// $9,400", saw it saved, saw it listed, and sent a proposal without it.
//
// So the quantity is asked for here, on the job it belongs to. Every write goes
// through the command registry, which is what puts an audit row behind it and
// what lets the same thing be done by voice.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PriceCategory, UnitType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dispatch } from '@/lib/commands/dispatch'
import { categoryLabel, unitLabel } from '@/modules/pricing/engine'
import { formatUsd, formatUsdCents } from '@/lib/money'

/** A rate a builder keeps, offered as a starting point for a job line. */
export interface PriceBookChoice {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
}

export interface ProjectLineItemView {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  quantity: number
  unitPrice: number
  note: string | null
}

export interface ProjectLineItemsProps {
  projectId: string
  items: ProjectLineItemView[]
  /** Every price-book row, so a builder can start from their own rate. */
  priceBookChoices: PriceBookChoice[]
}

const CATEGORIES = Object.values(PriceCategory) as PriceCategory[]
const UNIT_TYPES = Object.values(UnitType) as UnitType[]

/** Radix will not take an empty string as a select value. */
const ONE_OFF = 'one-off'

function lineTotal(item: { quantity: number; unitPrice: number }): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100
}

/** Trim a stored quantity for display: 1 rather than 1.000, 1.5 rather than 1.500. */
function formatQuantity(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

export function ProjectLineItems({ projectId, items, priceBookChoices }: ProjectLineItemsProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const subtotal = useMemo(
    () => Math.round(items.reduce((sum, item) => sum + lineTotal(item), 0) * 100) / 100,
    [items],
  )

  function handleRemove(item: ProjectLineItemView) {
    if (!confirm(`Remove "${item.name}" from this job? It stops billing straight away.`)) return
    startTransition(async () => {
      const result = await dispatch('remove.projectLineItem', {
        projectId,
        lineItemId: item.id,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Removed ${item.name}`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Added to this job</CardTitle>
            <p className="pt-1 text-sm text-muted-foreground">
              Walls, fences, electrical, permits and anything else the drawing cannot measure. What
              you add here is billed on this project&rsquo;s quote and prints on its documents.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={pending}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing added yet. This job is priced entirely from the drawing and the price book.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Unit price</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{item.name}</div>
                      {item.note ? (
                        <div className="text-xs text-muted-foreground">{item.note}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {categoryLabel(item.category)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatQuantity(item.quantity)}{' '}
                      <span className="text-xs text-muted-foreground">
                        {unitLabel(item.unitType)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsdCents(item.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatUsd(lineTotal(item))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(item)}
                        disabled={pending}
                        title={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Added to this job
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatUsd(subtotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      <AddLineItemDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        priceBookChoices={priceBookChoices}
        onAdded={() => router.refresh()}
      />
    </Card>
  )
}

function AddLineItemDialog({
  projectId,
  open,
  onOpenChange,
  priceBookChoices,
  onAdded,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  priceBookChoices: PriceBookChoice[]
  onAdded: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [sourceId, setSourceId] = useState<string>(ONE_OFF)
  const [category, setCategory] = useState<PriceCategory>(PriceCategory.MISC)
  const [name, setName] = useState('')
  const [unitType, setUnitType] = useState<UnitType>(UnitType.LUMP)
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [note, setNote] = useState('')

  function reset() {
    setSourceId(ONE_OFF)
    setCategory(PriceCategory.MISC)
    setName('')
    setUnitType(UnitType.LUMP)
    setQuantity('1')
    setUnitPrice('')
    setNote('')
  }

  function handleClose(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  // Picking a rate fills the form in rather than locking it: the price book
  // holds what a builder normally charges, and this job is allowed to differ.
  function handleSource(id: string) {
    setSourceId(id)
    if (id === ONE_OFF) return
    const choice = priceBookChoices.find((c) => c.id === id)
    if (!choice) return
    setCategory(choice.category)
    setName(choice.name)
    setUnitType(choice.unitType)
    setUnitPrice(String(choice.retailPrice))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give this line a name the customer will recognise.')
      return
    }
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('A quantity of zero would bill nothing. Enter how many.')
      return
    }
    const price = Number(unitPrice)
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Enter a unit price of zero or more.')
      return
    }

    // Built up field by field rather than spread: `exactOptionalPropertyTypes`
    // treats a key present and undefined as different from a key that is absent.
    const input: {
      projectId: string
      category: PriceCategory
      name: string
      unitType: UnitType
      quantity: number
      unitPrice: number
      note?: string
      priceBookItemId?: string
    } = {
      projectId,
      category,
      name: trimmed,
      unitType,
      quantity: qty,
      unitPrice: price,
    }
    if (note.trim()) input.note = note.trim()
    if (sourceId !== ONE_OFF) input.priceBookItemId = sourceId

    startTransition(async () => {
      const result = await dispatch('add.projectLineItem', input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${trimmed} added to this job`)
      handleClose(false)
      onAdded()
    })
  }

  const previewTotal = (() => {
    const qty = Number(quantity)
    const price = Number(unitPrice)
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return null
    return Math.round(qty * price * 100) / 100
  })()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to this job</DialogTitle>
          <DialogDescription>
            Start from a rate in your price book, or type a one-off. Either way it bills on this
            project only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Start from</Label>
            <Select value={sourceId} onValueChange={handleSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ONE_OFF}>A one-off, not in my price book</SelectItem>
                {priceBookChoices.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choice.name} · {formatUsdCents(choice.retailPrice)} per{' '}
                    {unitLabel(choice.unitType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pli-name">Name</Label>
            <Input
              id="pli-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Paver retaining wall"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PriceCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unitType} onValueChange={(v) => setUnitType(v as UnitType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pli-qty">Quantity</Label>
              <Input
                id="pli-qty"
                type="number"
                step="0.001"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pli-price">Unit price $</Label>
              <Input
                id="pli-price"
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="9400.00"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pli-note">Note</Label>
            <Input
              id="pli-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional. Prints nowhere; it is for your own reference."
            />
          </div>

          {previewTotal !== null ? (
            <p className="text-sm text-muted-foreground">
              This adds <span className="font-medium text-foreground">{formatUsd(previewTotal)}</span>{' '}
              to the quote, before tax.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add to job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
