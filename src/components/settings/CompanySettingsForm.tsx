'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dispatch } from '@/lib/commands/dispatch'
import {
  DEFAULT_PROPOSAL_TERMS,
  SUGGESTED_PAYMENT_SCHEDULE,
  scheduleTotalPercent,
  type CompanySettingsInput,
  type PaymentStage,
} from '@/modules/organization/company'

// Enough of a company to send one document.
//
// This form held four fields (name, logo URL, brand colour, sales tax) and a
// builder could not put their own address, phone number or contractor licence
// on the proposal a customer signs. Everything added here is printed by
// `ProposalDocument`; nothing here is stored and then ignored.

export type { CompanySettingsInput }

const INPUT_CLASS =
  'flex min-h-[7rem] w-full rounded-brand border-0 bg-theme-field px-3.5 py-2 text-bodyL text-theme-fg transition-[background,box-shadow] duration-brand ease-brand placeholder:text-theme-faint hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_84%)] focus-visible:bg-theme-bg focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--theme-fg)] disabled:cursor-not-allowed disabled:opacity-45'

export function CompanySettingsForm({ initial }: { initial: CompanySettingsInput }) {
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState(initial)
  const router = useRouter()

  function update<K extends keyof CompanySettingsInput>(key: K, value: CompanySettingsInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateStage(index: number, patch: Partial<PaymentStage>) {
    setForm((prev) => ({
      ...prev,
      paymentSchedule: prev.paymentSchedule.map((stage, i) =>
        i === index ? { ...stage, ...patch } : stage,
      ),
    }))
  }

  function addStage() {
    setForm((prev) => ({
      ...prev,
      paymentSchedule: [...prev.paymentSchedule, { label: '', percent: 0 }],
    }))
  }

  function removeStage(index: number) {
    setForm((prev) => ({
      ...prev,
      paymentSchedule: prev.paymentSchedule.filter((_, i) => i !== index),
    }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      // Through the registry, so changing the licence number that prints on a
      // contract leaves an audit row like every other action in the app.
      const res = await dispatch('settings.company.update', form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Company settings saved')
      router.refresh()
    })
  }

  const colorSwatch = /^#[0-9a-fA-F]{6}$/.test(form.brandColor) ? form.brandColor : '#0284c7'
  const scheduleTotal = scheduleTotalPercent(form.paymentSchedule)
  const scheduleOff =
    form.paymentSchedule.length > 0 && Math.abs(scheduleTotal - 100) >= 0.01

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <p className="text-bodyS text-theme-muted">Shown on customer proposals.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="company-name" label="Company name">
            <Input
              id="company-name"
              name="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </Field>
          <Field id="company-logo" label="Logo URL">
            <Input
              id="company-logo"
              name="logoUrl"
              value={form.logoUrl}
              placeholder="https://... or data:image/..."
              onChange={(e) => update('logoUrl', e.target.value)}
            />
          </Field>
          <Field id="company-brand-color" label="Brand color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorSwatch}
                onChange={(e) => update('brandColor', e.target.value)}
                className="h-9 w-12 rounded-brand border-0 bg-theme-field"
                aria-label="Brand color picker"
              />
              <Input
                id="company-brand-color"
                name="brandColor"
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
          <CardTitle>Business details</CardTitle>
          <p className="text-bodyS text-theme-muted">
            Printed in the header of every proposal and permit document. Florida requires the
            contractor licence number on a pool contract.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="company-address" label="Business address">
            <Input
              id="company-address"
              name="address"
              value={form.address}
              placeholder="1200 Gulf Blvd, Suite 4, Tampa FL 33606"
              onChange={(e) => update('address', e.target.value)}
            />
          </Field>
          <Field id="company-phone" label="Phone">
            <Input
              id="company-phone"
              name="phone"
              value={form.phone}
              placeholder="813-555-0180"
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field id="company-email" label="Email">
            <Input
              id="company-email"
              name="email"
              value={form.email}
              placeholder="office@yourpools.com"
              onChange={(e) => update('email', e.target.value)}
            />
          </Field>
          <Field id="company-license" label="Contractor licence number">
            <Input
              id="company-license"
              name="licenseNumber"
              value={form.licenseNumber}
              placeholder="CPC1457893"
              onChange={(e) => update('licenseNumber', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <p className="text-bodyS text-theme-muted">
            Default sales tax applied to every quote subtotal, and how long a proposal stands.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="company-tax" label="Default sales tax (%)">
            <Input
              id="company-tax"
              name="taxRatePct"
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
          <Field id="company-valid-days" label="Proposal valid for (days)">
            <Input
              id="company-valid-days"
              name="proposalValidDays"
              type="number"
              min={1}
              max={365}
              step="1"
              value={form.proposalValidDays}
              onChange={(e) =>
                update(
                  'proposalValidDays',
                  Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 1))),
                )
              }
            />
            <p className="font-brandMono text-formLabel text-theme-muted">
              Used to work out the expiration date a proposal prints when nobody sets one by hand.
            </p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment schedule</CardTitle>
          <p className="text-bodyS text-theme-muted">
            Deposit and draws, printed on every proposal as dollar amounts against that job&apos;s
            total. Leave it empty and the proposal prints no schedule.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.paymentSchedule.length === 0 ? (
            <p className="text-bodyS text-theme-muted">No stages yet.</p>
          ) : null}
          {form.paymentSchedule.map((stage, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_7rem_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor={`stage-label-${index}`}>
                  Stage
                </Label>
                <Input
                  id={`stage-label-${index}`}
                  name={`paymentSchedule.${index}.label`}
                  value={stage.label}
                  placeholder="Deposit"
                  onChange={(e) => updateStage(index, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`stage-percent-${index}`}>
                  Percent
                </Label>
                <Input
                  id={`stage-percent-${index}`}
                  name={`paymentSchedule.${index}.percent`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={stage.percent}
                  onChange={(e) =>
                    updateStage(index, {
                      percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`stage-due-${index}`}>
                  Due
                </Label>
                <Input
                  id={`stage-due-${index}`}
                  name={`paymentSchedule.${index}.dueOn`}
                  value={stage.dueOn ?? ''}
                  placeholder="On signing"
                  onChange={(e) => updateStage(index, { dueOn: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeStage(index)}
                  aria-label={`Remove stage ${index + 1}`}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" variant="outline" onClick={addStage}>
              Add stage
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => update('paymentSchedule', [...SUGGESTED_PAYMENT_SCHEDULE])}
            >
              Use a standard schedule
            </Button>
            <span className="flex flex-wrap items-center gap-2 text-bodyS">
              <span
                className={
                  scheduleOff
                    ? 'font-brandMono text-formLabel uppercase text-brand-red'
                    : 'font-brandMono text-formLabel uppercase text-theme-muted'
                }
              >
                Total: {scheduleTotal.toFixed(2)}%
              </span>
              {scheduleOff ? (
                <span className="text-brand-red">A schedule has to add up to 100% before it can be saved.</span>
              ) : null}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proposal terms</CardTitle>
          <p className="text-bodyS text-theme-muted">
            The paragraph printed under Terms on every proposal. Leave it empty to print the
            default wording.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field id="company-terms" label="Terms paragraph">
            <textarea
              id="company-terms"
              name="proposalTerms"
              className={INPUT_CLASS}
              rows={6}
              value={form.proposalTerms}
              placeholder={DEFAULT_PROPOSAL_TERMS}
              onChange={(e) => update('proposalTerms', e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={() => update('proposalTerms', DEFAULT_PROPOSAL_TERMS)}
          >
            Start from the default wording
          </Button>
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

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
