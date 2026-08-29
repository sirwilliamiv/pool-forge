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
      <div className="rounded-brand16 border border-theme-line bg-tint-mint px-4 py-3 text-bodyS text-ink-black">
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
        <label className="mb-1.5 block text-bodyS font-medium text-theme-fg">
          Type your full name to accept this proposal
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? 'Submitting…' : 'Accept proposal'}
      </Button>
    </form>
  )
}
