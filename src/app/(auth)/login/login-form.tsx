'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import { loginAction } from './actions'

// Prefilled in development only. `process.env.NODE_ENV` is inlined by Next at
// build time, so a production bundle contains neither the values nor the note:
// this is a convenience for the seeded local database, not a way in.
const DEV_LOGIN =
  process.env.NODE_ENV === 'production'
    ? null
    : { email: 'demo@poolforge.test', password: 'demo1234' }

export function LoginForm() {
  const params = useSearchParams()
  const next = params.get('next') ?? '/dashboard'
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(form: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await loginAction(form)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back. Enter your credentials.</CardDescription>
      </CardHeader>
      <form action={onSubmit}>
        <CardContent className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={DEV_LOGIN?.email ?? ''}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue={DEV_LOGIN?.password ?? ''}
              required
            />
          </div>
          {DEV_LOGIN ? (
            <p className="text-sm text-muted-foreground">
              Development build: the seeded demo account is filled in for you.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
          {/* No "create one" link any more: Pool Forge is invite only, and a
              sign-up link that leads to a refusal is worse than no link. What a
              locked-out builder actually needs is the next line. */}
          <p className="text-sm text-muted-foreground">
            <Link href="/forgot-password" className="underline underline-offset-4">
              Forgotten your password?
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
