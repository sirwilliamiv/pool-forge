'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { shareProject, unshareProject } from '@/modules/projects/share'

export function ShareProposalCard({
  projectId,
  initialToken,
  accepted,
}: {
  projectId: string
  initialToken: string | null
  accepted: { name: string; at: string } | null
}) {
  const [pending, startTransition] = React.useTransition()
  const [token, setToken] = React.useState<string | null>(initialToken)
  const [origin, setOrigin] = React.useState('')
  const router = useRouter()

  React.useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const url = token ? `${origin}/share/${token}` : ''

  function generate() {
    startTransition(async () => {
      const res = await shareProject(projectId)
      if (!res.ok) {
        toast.error(res.error ?? 'Failed to create link')
        return
      }
      setToken(res.token)
      router.refresh()
    })
  }

  function revoke() {
    startTransition(async () => {
      const res = await unshareProject(projectId)
      if (!res.ok) {
        toast.error(res.error ?? 'Failed to revoke link')
        return
      }
      setToken(null)
      router.refresh()
    })
  }

  function copy() {
    if (!url) return
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success('Link copied'))
      .catch(() => toast.error('Could not copy'))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share proposal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {accepted ? (
          <div className="rounded-brand border border-theme-line bg-tint-mint px-3.5 py-2.5 text-bodyS text-ink-black">
            Accepted by {accepted.name} on {accepted.at}.
          </div>
        ) : null}
        {token ? (
          <>
            <div className="flex gap-2">
              {/* Named, like every other control on this page: an unlabelled
                  read-only box is announced as nothing at all. */}
              <Label htmlFor="share-proposal-url" className="sr-only">
                Customer proposal link
              </Label>
              <Input
                id="share-proposal-url"
                name="share-proposal-url"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={copy}>
                Copy
              </Button>
            </div>
            <div className="flex items-center gap-4 text-bodyS">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-fg underline-offset-4 hover:underline"
              >
                Open link
              </a>
              <button
                type="button"
                onClick={revoke}
                disabled={pending}
                className="text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
              >
                Revoke
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-bodyS text-theme-muted">
              Create a private link the customer can open to view and accept this proposal. No
              sign-in required.
            </p>
            <Button type="button" onClick={generate} disabled={pending}>
              {pending ? 'Creating…' : 'Create link'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
