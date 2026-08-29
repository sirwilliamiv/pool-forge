import * as React from 'react'
import { cn } from '@/lib/utils'

// Brand bible: a field is a quiet fill, not a box. No border at rest; focus
// draws the hairline as an inset ring in full ink, which is louder than a
// colour change and does not depend on a hue.

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-brand border-0 bg-theme-field px-3.5 py-2 text-bodyL text-theme-fg transition-[background,box-shadow] duration-brand ease-brand file:border-0 file:bg-transparent file:text-bodyS file:font-medium placeholder:text-theme-faint hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_84%)] focus-visible:bg-theme-bg focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--theme-fg)] disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
