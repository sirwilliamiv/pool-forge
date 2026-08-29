'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Action = (input: { name: string; customerName: string }) => Promise<{ ok: boolean; id?: string; error?: string }>

export function NewProjectDialog({ action }: { action: Action }) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  function onSubmit(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const customerName = String(formData.get('customerName') ?? '').trim()
    if (!name) {
      toast.error('Project name is required')
      return
    }
    startTransition(async () => {
      const result = await action({ name, customerName })
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to create project')
        return
      }
      setOpen(false)
      toast.success('Project created')
      if (result.id) {
        router.push(`/projects/${result.id}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Explicit `text-theme-bg`: the shared Button primitive's `default`
            variant loses its own text colour here. `cva` merges the variant's
            `text-theme-bg` and the size's `text-bodyL` into one string, and
            `cn`'s tailwind-merge treats any unrecognised `text-*` class (the
            brand type scale isn't in its default keyword list) as a text
            *colour* utility, so it dedupes the two as "conflicting" and keeps
            whichever is last — the font size, not the colour. The button
            renders with no colour rule at all and inherits black, which reads
            as a black-on-black button. Reported in the PR rather than patched
            in `ui/button.tsx`, which this pass does not own. */}
        <Button className="text-theme-bg">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-brand16 border-theme-line bg-theme-bg text-theme-fg sm:rounded-brand16">
        <DialogHeader>
          <DialogTitle className="text-title4 font-semibold text-theme-fg">Create project</DialogTitle>
          <DialogDescription className="text-bodyS text-theme-muted">
            Start a new pool design and quote.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" placeholder="Smith residence" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer name (optional)</Label>
            <Input id="customerName" name="customerName" placeholder="John Smith" />
          </div>
          <DialogFooter>
            <Button type="submit" className="text-theme-bg" disabled={pending}>
              {pending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
