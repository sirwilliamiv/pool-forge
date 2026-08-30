'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PriceCategory, UnitType } from '@prisma/client'
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
import { dispatch } from '@/lib/commands/dispatch'
import {
  PRICING_OPTIONS,
  optionLabel,
  type PricingOptionKey,
} from '@/modules/pricing/engine'

/** What the price book dialog sends to `pricebook.item.add` / `.update`. */
export interface ItemInput {
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
  unitCost?: number
  customerVisible: boolean
  internalOnly: boolean
  required: boolean
  upgradeOnly: boolean
  optionKey: PricingOptionKey | null
}

const UNIT_TYPES: UnitType[] = [UnitType.SQFT, UnitType.LF, UnitType.EACH, UnitType.LUMP, UnitType.HOUR]
const PRICE_CATEGORIES: PriceCategory[] = Object.values(PriceCategory) as PriceCategory[]

/** The sentinel the option select uses for "no option". Radix rejects "". */
const NO_OPTION = 'none'

/**
 * Categories nothing in a drawing measures.
 *
 * An item in one of these is a real price the builder keeps, and no drawing can
 * ever say how many feet of fence a yard needs or what the county charges for a
 * permit. They are added to a job by hand from the project page, and saying so
 * here is the difference between "this is priced per job" and the old
 * behaviour, which was to accept the item, list it, and never bill it.
 */
const PER_JOB_CATEGORIES: ReadonlySet<PriceCategory> = new Set([
  PriceCategory.LANAI,
  PriceCategory.FENCE,
  PriceCategory.WALL,
  PriceCategory.ELECTRICAL,
  PriceCategory.MISC,
])

export interface ExistingItem {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
  unitCost: number
  customerVisible: boolean
  internalOnly: boolean
  required: boolean
  upgradeOnly: boolean
  optionKey: PricingOptionKey | null
}

export interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ExistingItem | undefined
}

export function PriceBookItemDialog({
  open,
  onOpenChange,
  item,
}: PriceBookItemDialogProps) {
  const router = useRouter()
  const isEdit = Boolean(item)
  const [pending, startTransition] = useTransition()

  const [category, setCategory] = useState<PriceCategory>(item?.category ?? PriceCategory.MISC)
  const [name, setName] = useState(item?.name ?? '')
  const [unitType, setUnitType] = useState<UnitType>(item?.unitType ?? UnitType.EACH)
  const [retailPrice, setRetailPrice] = useState(item?.retailPrice.toString() ?? '0')
  const [unitCost, setUnitCost] = useState(item?.unitCost.toString() ?? '')
  const [customerVisible, setCustomerVisible] = useState(item?.customerVisible ?? true)
  const [internalOnly, setInternalOnly] = useState(item?.internalOnly ?? false)
  const [required, setRequired] = useState(item?.required ?? false)
  const [upgradeOnly, setUpgradeOnly] = useState(item?.upgradeOnly ?? false)
  const [optionKey, setOptionKey] = useState<PricingOptionKey | null>(item?.optionKey ?? null)

  function reset() {
    setCategory(PriceCategory.MISC)
    setName('')
    setUnitType(UnitType.EACH)
    setRetailPrice('0')
    setUnitCost('')
    setCustomerVisible(true)
    setInternalOnly(false)
    setRequired(false)
    setUpgradeOnly(false)
    setOptionKey(null)
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
      category,
      name: name.trim(),
      unitType,
      retailPrice: retail,
      ...(cost !== undefined ? { unitCost: cost } : {}),
      customerVisible,
      internalOnly,
      required,
      upgradeOnly,
      optionKey,
    }
    if (!payload.name) {
      toast.error('Name is required')
      return
    }

    startTransition(async () => {
      const result =
        isEdit && item
          ? await dispatch('pricebook.item.update', { itemId: item.id, ...payload })
          : await dispatch('pricebook.item.add', payload)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(isEdit ? 'Item updated' : 'Item created')
      handleClose(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-theme-line bg-theme-bg text-theme-fg sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-title4 font-display font-medium tracking-normal">
            {isEdit ? 'Edit item' : 'Add price book item'}
          </DialogTitle>
          <DialogDescription className="text-bodyS text-theme-muted">
            {isEdit ? 'Update this line item.' : 'Create a new line item for the active price book.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-formLabel">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PriceCategory)}>
                <SelectTrigger className="border-theme-line bg-theme-field text-theme-fg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-theme-line bg-theme-bg text-theme-fg">
                  {PRICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-name" className="text-formLabel">
                Name
              </Label>
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
              <Label className="text-formLabel">Unit type</Label>
              <Select value={unitType} onValueChange={(v) => setUnitType(v as UnitType)}>
                <SelectTrigger className="border-theme-line bg-theme-field text-theme-fg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-theme-line bg-theme-bg text-theme-fg">
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-retail" className="text-formLabel">
                Retail $
              </Label>
              <Input
                id="pb-retail"
                type="number"
                step="0.01"
                min="0"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                required
                className="font-brandMono tabular-nums tracking-[0.5px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-cost" className="text-formLabel">
                Cost $
              </Label>
              <Input
                id="pb-cost"
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="optional"
                className="font-brandMono tabular-nums tracking-[0.5px]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-formLabel">Billed when the customer chooses</Label>
            <Select
              value={optionKey ?? NO_OPTION}
              onValueChange={(v) => setOptionKey(v === NO_OPTION ? null : (v as PricingOptionKey))}
            >
              <SelectTrigger className="border-theme-line bg-theme-field text-theme-fg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-theme-line bg-theme-bg text-theme-fg">
                <SelectItem value={NO_OPTION}>Anything in its category</SelectItem>
                {PRICING_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {optionLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-bodyS text-theme-muted">
              {optionKey === null
                ? 'This line bills whenever its category applies. Leave it here unless two items in the category are alternatives: a heater and a salt cell both set to this will both be charged the moment a customer asks for either.'
                : `This line is charged only when the customer asks for a ${optionLabel(optionKey).toLowerCase()}.`}
            </p>
          </div>

          {PER_JOB_CATEGORIES.has(category) ? (
            <p className="rounded-brand border border-theme-line bg-theme-card px-3 py-2 text-bodyS text-theme-fg">
              Nothing in a drawing measures {category === PriceCategory.MISC ? 'this' : 'these'}, so
              this item is not billed automatically. Open a project and add it under “Added to this
              job” to put it on that quote, with the quantity for that job.
            </p>
          ) : null}

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
    <label htmlFor={id} className="flex items-center gap-2 text-bodyS text-theme-fg">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="border-theme-line data-[state=checked]:border-theme-fg data-[state=checked]:bg-theme-fg data-[state=checked]:text-theme-bg"
      />
      {label}
    </label>
  )
}
