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
import { acceptInviteAction } from './actions'

export interface InviteFormProps {
  token: string
  email: string
  orgName: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  /** True when the address already has a Pool Forge account. */
  hasAccount: boolean
}

const ROLE_WORDS: Record<InviteFormProps['role'], string> = {
  OWNER: 'an owner',
  ADMIN: 'an admin',
  MEMBER: 'a member',
}

export function InviteForm({ token, email, orgName, role, hasAccount }: InviteFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(form: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await acceptInviteAction(form)
      // A success redirects, so reaching here at all means it did not.
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {orgName}</CardTitle>
        <CardDescription>
          {email} has been invited to {orgName} as {ROLE_WORDS[role]}.
          {hasAccount
            ? ' You already have a Pool Forge account, so enter its password to join.'
            : ' Choose a password to finish setting up your account.'}
        </CardDescription>
      </CardHeader>
      <form action={onSubmit}>
        <CardContent className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {hasAccount ? null : (
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" type="text" autoComplete="name" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            {/* Shown, not editable. The invite is to this address, and letting
                it be changed would let one link create an account anywhere. */}
            <Input id="email" type="email" value={email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              {hasAccount ? 'Your Pool Forge password' : 'Choose a password'}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={hasAccount ? 'current-password' : 'new-password'}
              minLength={hasAccount ? 1 : 8}
              required
            />
            {hasAccount ? null : (
              <p className="text-bodyS text-theme-muted">At least 8 characters.</p>
            )}
          </div>
          {error ? <p className="text-bodyS text-brand-red">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Joining…' : `Join ${orgName}`}
          </Button>
          <p className="text-bodyS text-theme-muted">
            Already signed up?{' '}
            <Link href="/login" className="underline underline-offset-4 hover:text-theme-fg">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
