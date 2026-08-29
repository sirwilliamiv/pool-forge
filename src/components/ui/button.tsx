import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// The brand bible's one button shape (docs/brand-bible.md): 8px radius on every
// variant, the 0.18s background fade, and colours mixed off the theme
// foreground rather than named literals, so the whole set inverts on two hex
// values. Variant names are shadcn's and deliberately unchanged — 29 files call
// this, and renaming them would be a rewrite rather than a restyle.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-brand font-medium tracking-[-0.0075rem] transition-[background,box-shadow,color] duration-brand ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-fg focus-visible:ring-offset-2 focus-visible:ring-offset-theme-bg disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'bg-theme-fg text-theme-bg hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_20%)]',
        destructive: 'bg-brand-red text-ink-black hover:bg-[color-mix(in_oklch,var(--brand-red),transparent_18%)]',
        outline:
          'bg-transparent text-theme-fg shadow-[inset_0_0_0_1px_var(--theme-border)] hover:bg-theme-card',
        secondary: 'bg-theme-card text-theme-fg hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_84%)]',
        ghost: 'text-theme-fg hover:bg-theme-card',
        link: 'text-theme-fg underline-offset-4 hover:underline',
      },
      // 46px is the bible's button height. The smaller steps are for dense
      // toolbars, which the editor is full of.
      size: {
        default: 'h-[2.875rem] px-[1.375rem] text-bodyL',
        sm: 'h-9 px-3 text-bodyS',
        lg: 'h-12 px-8 text-bodyL',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
