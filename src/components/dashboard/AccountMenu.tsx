'use client'

import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  userLabel: string
  /** A server action. Passed in rather than imported so this file stays a client component. */
  logout: () => Promise<void>
}

/**
 * The account menu, and the one reason it is a client component.
 *
 * Log out used to be a plain `<button type="submit">` inside a form inside the
 * menu item, which reads correctly and does nothing. The menu closes on
 * `pointerup`, which unmounts the portal that contains the form, and the
 * browser then has no form left to dispatch `click` and `submit` against. The
 * button is real, the action is real, and the press is swallowed in the gap
 * between the two. Nothing errors, which is why it survived: it looks wired up
 * from every angle except pressing it.
 *
 * So the selection is intercepted before Radix acts on it, and the form is
 * submitted by hand while it is still in the document. Keeping the form (rather
 * than calling the action straight from the handler) means the button still
 * works as an ordinary submit when JavaScript has not loaded.
 */
export function AccountMenu({ userLabel, logout }: Props) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {userLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{userLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form ref={formRef} action={logout}>
          <DropdownMenuItem
            asChild
            onSelect={event => {
              // Hold the menu open. Radix would otherwise close it here, and the
              // submit below would fire into a form that is no longer mounted.
              event.preventDefault()
              formRef.current?.requestSubmit()
            }}
          >
            <button type="submit" className="w-full text-left">
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
