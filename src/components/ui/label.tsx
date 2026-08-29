'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Brand bible: mono means metadata, and a field label is metadata about the
// field. 11px uppercase with positive tracking, which is the one place mono is
// allowed to carry positive tracking and the one place it is allowed at all
// outside badges, versions and dates.
const labelVariants = cva(
  'font-brandMono text-formLabel uppercase text-theme-fg peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
