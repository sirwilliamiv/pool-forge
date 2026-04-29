'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="no-print gap-2"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  )
}
