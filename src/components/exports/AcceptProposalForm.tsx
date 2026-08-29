'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { acceptProposal } from '@/modules/projects/share'

export function AcceptProposalForm({
  token,
  accepted,
}: {
  token: string
  accepted: { name: string; at: string } | null
}) {
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const router = useRouter()

  if (accepted) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Accepted by {accepted.name} on {accepted.at}. Thank you.
      </div>
    )
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await acceptProposal(token, name)
      if (!res.ok) {
        toast.error(res.error ?? 'Could not accept')
        return
      }
      toast.success('Proposal accepted')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-medium">
          Type your full name to accept this proposal
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Accept proposal'}
      </Button>
    </form>
  )
}
