'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PriceBookItemDialog } from './PriceBookItemDialog'

export function AddItemButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Add item
      </Button>
      <PriceBookItemDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
