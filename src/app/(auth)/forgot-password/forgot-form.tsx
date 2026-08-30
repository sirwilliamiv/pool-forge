'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { forgotPasswordAction } from './actions'

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(form: FormData) {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await forgotPasswordAction(form)
      if (result.ok) setMessage(result.message)
      else setError(result.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgotten password</CardTitle>
        <CardDescription>
          Enter the address you sign in with and we will send a link to set a new password.
        </CardDescription>
      </CardHeader>
      <form action={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          {/* One element, one style, whatever the address was. A confirmation
              rendered differently for a known address would leak exactly what
              the wording is careful not to. */}
          {message ? (
            <p data-testid="reset-result" className="text-bodyS text-theme-muted">
              {message}
            </p>
          ) : null}
          {error ? <p className="text-bodyS text-brand-red">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Sending…' : 'Send the link'}
          </Button>
          <p className="text-bodyS text-theme-muted">
            <Link href="/login" className="underline underline-offset-4 hover:text-theme-fg">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
