'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ProjectStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
    heaterSelected: boolean
    saltSystemSelected: boolean
    screenSelected: boolean
    lightingQuantity: number
  }
}

type SaveAction = (projectId: string, input: ProjectFormInput['initial']) => Promise<{ ok: boolean; error?: string }>

/**
 * How long to wait after the last keystroke before saving.
 *
 * Long enough not to write on every character, short enough that clicking away
 * from a field you have just typed into does not lose it.
 */
const AUTOSAVE_DELAY_MS = 900

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ProjectForm({
  projectId,
  initial,
  saveAction,
}: ProjectFormInput & { saveAction: SaveAction }) {
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState(initial)
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const router = useRouter()

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The last values written, so an unchanged form does not save on every render. */
  const lastSaved = React.useRef(initial)
  /** Nothing has been edited yet, so hydration must not trigger a write. */
  const dirty = React.useRef(false)

  const save = React.useCallback(
    async (values: ProjectFormInput['initial'], announce: boolean) => {
      setSaveState('saving')
      const res = await saveAction(projectId, values)
      if (!res.ok) {
        setSaveState('error')
        toast.error(res.error ?? 'Failed to save')
        return
      }
      lastSaved.current = values
      setSaveState('saved')
      if (announce) toast.success('Project saved')
      // So the header, the dashboard and anything else reading the name agree
      // with the field the user just typed into.
      router.refresh()
    },
    [projectId, router, saveAction],
  )

  function update<K extends keyof ProjectFormInput['initial']>(key: K, value: ProjectFormInput['initial'][K]) {
    dirty.current = true
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Autosave. The editor has saved continuously from the start; this form did
  // not, so a name typed and then navigated away from was simply lost, and the
  // save looked broken when it was never asked to run.
  React.useEffect(() => {
    if (!dirty.current) return
    if (JSON.stringify(form) === JSON.stringify(lastSaved.current)) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void save(form, false)
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, save])

  // A pending edit must not die with the page. Leaving during the debounce
  // window is exactly when someone types a name and immediately clicks away.
  React.useEffect(() => {
    return () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      void saveAction(projectId, form)
    }
  }, [form, projectId, saveAction])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    startTransition(() => {
      void save(form, true)
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

      <Card>
        <CardHeader>
          <CardTitle>Selections</CardTitle>
          <p className="text-sm text-muted-foreground">
            These drive the quote, validation, and the customer proposal.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CheckField
            label="Include heater"
            checked={form.heaterSelected}
            onChange={(v) => update('heaterSelected', v)}
          />
          <CheckField
            label="Include salt system"
            checked={form.saltSystemSelected}
            onChange={(v) => update('saltSystemSelected', v)}
          />
          <CheckField
            label="Include screen enclosure"
            checked={form.screenSelected}
            onChange={(v) => update('screenSelected', v)}
          />
          <Field label="Pool lights (qty)">
            <Input
              type="number"
              min={0}
              value={form.lightingQuantity}
              onChange={(e) =>
                update('lightingQuantity', Math.max(0, Math.floor(Number(e.target.value) || 0)))
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-end gap-3">
        {/* Said out loud, because an autosaving form that shows nothing leaves
            the user unsure whether their typing went anywhere. */}
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Not saved'}
        </span>
        <Button type="submit" disabled={pending || saveState === 'saving'}>
          {pending || saveState === 'saving' ? 'Saving…' : 'Save'}
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

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 py-2">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="text-sm">{label}</span>
    </label>
  )
}
