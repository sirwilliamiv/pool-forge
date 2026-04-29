'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { Checkbox } from '@/components/ui/checkbox'
import { createItem, updateItem, type ItemInput } from '@/app/(app)/settings/price-book/actions'

const UNIT_TYPES = ['sqft', 'lf', 'each', 'lump', 'hour'] as const

export interface ExistingItem {
  id: string
  category: string
  name: string
  unitType: string
  retailPrice: number
  unitCost: number
  customerVisible: boolean
  internalOnly: boolean
  required: boolean
  upgradeOnly: boolean
}

export interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ExistingItem | undefined
  knownCategories?: string[]
}

export function PriceBookItemDialog({
  open,
  onOpenChange,
  item,
  knownCategories = [],
}: PriceBookItemDialogProps) {
  const isEdit = Boolean(item)
  const [pending, startTransition] = useTransition()

  const [category, setCategory] = useState(item?.category ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [unitType, setUnitType] = useState<(typeof UNIT_TYPES)[number]>(
    (item?.unitType as (typeof UNIT_TYPES)[number] | undefined) ?? 'each',
  )
  const [retailPrice, setRetailPrice] = useState(item?.retailPrice.toString() ?? '0')
  const [unitCost, setUnitCost] = useState(item?.unitCost.toString() ?? '')
  const [customerVisible, setCustomerVisible] = useState(item?.customerVisible ?? true)
  const [internalOnly, setInternalOnly] = useState(item?.internalOnly ?? false)
  const [required, setRequired] = useState(item?.required ?? false)
  const [upgradeOnly, setUpgradeOnly] = useState(item?.upgradeOnly ?? false)

  function reset() {
    setCategory('')
    setName('')
    setUnitType('each')
    setRetailPrice('0')
    setUnitCost('')
    setCustomerVisible(true)
    setInternalOnly(false)
    setRequired(false)
    setUpgradeOnly(false)
  }

  function handleClose(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const retail = Number(retailPrice)
    if (!Number.isFinite(retail) || retail < 0) {
      toast.error('Retail price must be a non-negative number')
      return
    }
    const cost = unitCost.trim() === '' ? undefined : Number(unitCost)
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      toast.error('Unit cost must be a non-negative number')
      return
    }

    const payload: ItemInput = {
      category: category.trim() || 'Uncategorized',
      name: name.trim(),
      unitType,
      retailPrice: retail,
      ...(cost !== undefined ? { unitCost: cost } : {}),
      customerVisible,
      internalOnly,
      required,
      upgradeOnly,
    }
    if (!payload.name) {
      toast.error('Name is required')
      return
    }

    startTransition(async () => {
      try {
        if (isEdit && item) {
          await updateItem(item.id, payload)
          toast.success('Item updated')
        } else {
          await createItem(payload)
          toast.success('Item created')
        }
        handleClose(false)
      } catch (err) {
        toast.error((err as Error).message ?? 'Failed to save')
      }
    })
  }

  const datalistId = 'pricebook-categories'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit item' : 'Add price book item'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this line item.' : 'Create a new line item for the active price book.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pb-category">Category</Label>
              <Input
                id="pb-category"
                list={datalistId}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Pool, Deck, Equipment…"
              />
              <datalist id={datalistId}>
                {knownCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-name">Name</Label>
              <Input
                id="pb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Unit type</Label>
              <Select value={unitType} onValueChange={(v) => setUnitType(v as typeof unitType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-retail">Retail $</Label>
              <Input
                id="pb-retail"
                type="number"
                step="0.01"
                min="0"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-cost">Cost $</Label>
              <Input
                id="pb-cost"
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <FlagToggle id="pb-vis" label="Customer visible" checked={customerVisible} onChange={setCustomerVisible} />
            <FlagToggle id="pb-int" label="Internal only" checked={internalOnly} onChange={setInternalOnly} />
            <FlagToggle id="pb-req" label="Required" checked={required} onChange={setRequired} />
            <FlagToggle id="pb-upg" label="Upgrade only" checked={upgradeOnly} onChange={setUpgradeOnly} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FlagToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      {label}
    </label>
  )
}
