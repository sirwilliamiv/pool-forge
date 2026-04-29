'use client'

import { useEditorStore } from '@/modules/editor/state'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// TODO(Track E): consider mounting this in <Sheet> for slide-in animation
// once the sheet primitive lands at @/components/ui/sheet.
export function QuotePanel() {
  const open = useEditorStore((s) => s.quotePanelOpen)
  const setOpen = useEditorStore((s) => s.setQuotePanel)

  if (!open) return null

  return (
    <aside
      className={cn(
        'absolute right-0 top-0 z-30 flex h-full w-80 flex-col border-l bg-background shadow-lg',
        'transition-transform duration-200',
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Live quote</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <Separator />
      <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
        <p className="text-muted-foreground">
          Quote sections will populate here as the pricing engine wires up.
        </p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>Pool</li>
          <li>Pool features</li>
          <li>Interior finish</li>
          <li>Sanitation</li>
          <li>Pump and filter</li>
          <li>Heater</li>
          <li>Lighting</li>
          <li>Deck</li>
          <li>Coping</li>
          <li>Screen</li>
          <li>Electrical</li>
          <li>Miscellaneous</li>
          <li>Upgrades</li>
          <li>Discounts</li>
          <li>Total investment</li>
        </ul>
      </div>
    </aside>
  )
}
