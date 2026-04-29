'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ProjectStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { value: 'PROPOSAL_SENT', label: 'Proposal sent' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CONSTRUCTION_READY', label: 'Construction ready' },
  { value: 'ARCHIVED', label: 'Archived' },
]

export type ProjectFormInput = {
  projectId: string
  initial: {
    name: string
    salesperson: string
    designer: string
    status: ProjectStatus
    proposalExpiresAt: string
    internalNotes: string
    customerName: string
    customerEmail: string
    customerPhone: string
    customerAddress: string
    customerNotes: string
    poolType: string
    depthShallow: string
    depthDeep: string
    interiorFinish: string
    equipmentPackage: string
    sanitizationPackage: string
    heaterSelection: string
    lightingSelection: string
    deckMaterial: string
    copingMaterial: string
    screenOption: string
  }
}

type SaveAction = (projectId: string, input: ProjectFormInput['initial']) => Promise<{ ok: boolean; error?: string }>

export function ProjectForm({
  projectId,
  initial,
  saveAction,
}: ProjectFormInput & { saveAction: SaveAction }) {
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState(initial)
  const router = useRouter()

  function update<K extends keyof ProjectFormInput['initial']>(key: K, value: ProjectFormInput['initial'][K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveAction(projectId, form)
      if (!res.ok) {
        toast.error(res.error ?? 'Failed to save')
        return
      }
      toast.success('Project saved')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => update('status', v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Salesperson">
            <Input value={form.salesperson} onChange={(e) => update('salesperson', e.target.value)} />
          </Field>
          <Field label="Designer">
            <Input value={form.designer} onChange={(e) => update('designer', e.target.value)} />
          </Field>
          <Field label="Proposal expires">
            <Input
              type="date"
              value={form.proposalExpiresAt}
              onChange={(e) => update('proposalExpiresAt', e.target.value)}
            />
          </Field>
          <Field label="Internal notes" full>
            <Input value={form.internalNotes} onChange={(e) => update('internalNotes', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={form.customerName} onChange={(e) => update('customerName', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.customerEmail} onChange={(e) => update('customerEmail', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.customerPhone} onChange={(e) => update('customerPhone', e.target.value)} />
          </Field>
          <Field label="Job address">
            <Input value={form.customerAddress} onChange={(e) => update('customerAddress', e.target.value)} />
          </Field>
          <Field label="Customer notes" full>
            <Input value={form.customerNotes} onChange={(e) => update('customerNotes', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pool</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Pool type">
            <Input value={form.poolType} onChange={(e) => update('poolType', e.target.value)} />
          </Field>
          <Field label="Depth (shallow)">
            <Input value={form.depthShallow} onChange={(e) => update('depthShallow', e.target.value)} />
          </Field>
          <Field label="Depth (deep)">
            <Input value={form.depthDeep} onChange={(e) => update('depthDeep', e.target.value)} />
          </Field>
          <Field label="Interior finish">
            <Input value={form.interiorFinish} onChange={(e) => update('interiorFinish', e.target.value)} />
          </Field>
          <Field label="Equipment package">
            <Input value={form.equipmentPackage} onChange={(e) => update('equipmentPackage', e.target.value)} />
          </Field>
          <Field label="Sanitization package">
            <Input value={form.sanitizationPackage} onChange={(e) => update('sanitizationPackage', e.target.value)} />
          </Field>
          <Field label="Heater selection">
            <Input value={form.heaterSelection} onChange={(e) => update('heaterSelection', e.target.value)} />
          </Field>
          <Field label="Lighting selection">
            <Input value={form.lightingSelection} onChange={(e) => update('lightingSelection', e.target.value)} />
          </Field>
          <Field label="Deck material">
            <Input value={form.deckMaterial} onChange={(e) => update('deckMaterial', e.target.value)} />
          </Field>
          <Field label="Coping material">
            <Input value={form.copingMaterial} onChange={(e) => update('copingMaterial', e.target.value)} />
          </Field>
          <Field label="Screen option" full>
            <Input value={form.screenOption} onChange={(e) => update('screenOption', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-2 ${full ? 'md:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
