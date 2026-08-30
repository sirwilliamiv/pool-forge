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
        <Button>
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
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
