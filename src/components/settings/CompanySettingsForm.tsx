'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type CompanySettingsInput = {
  name: string
  logoUrl: string
  brandColor: string
  taxRatePct: number
}

type SaveAction = (input: CompanySettingsInput) => Promise<{ ok: boolean; error?: string }>

export function CompanySettingsForm({
  initial,
  saveAction,
}: {
  initial: CompanySettingsInput
  saveAction: SaveAction
}) {
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState(initial)
  const router = useRouter()

  function update<K extends keyof CompanySettingsInput>(key: K, value: CompanySettingsInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveAction(form)
      if (!res.ok) {
        toast.error(res.error ?? 'Failed to save')
        return
      }
      toast.success('Company settings saved')
      router.refresh()
    })
  }

  const colorSwatch = /^#[0-9a-fA-F]{6}$/.test(form.brandColor) ? form.brandColor : '#0284c7'

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <p className="text-sm text-muted-foreground">Shown on customer proposals.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Company name">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label="Logo URL">
            <Input
              value={form.logoUrl}
              placeholder="https://... or data:image/..."
              onChange={(e) => update('logoUrl', e.target.value)}
            />
          </Field>
          <Field label="Brand color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorSwatch}
                onChange={(e) => update('brandColor', e.target.value)}
                className="h-9 w-12 rounded border"
                aria-label="Brand color picker"
              />
              <Input
                value={form.brandColor}
                placeholder="#0284c7"
                onChange={(e) => update('brandColor', e.target.value)}
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <p className="text-sm text-muted-foreground">
            Default sales tax applied to every quote subtotal.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Default sales tax (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.001"
              value={form.taxRatePct}
              onChange={(e) =>
                update('taxRatePct', Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
