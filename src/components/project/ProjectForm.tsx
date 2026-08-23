'use client'

import * as React from 'react'
import Link from 'next/link'
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
import { SALT_SYSTEM_LABEL } from '@/modules/projects/pool-fields'

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
  { value: 'PROPOSAL_SENT', label: 'Proposal sent' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CONSTRUCTION_READY', label: 'Construction ready' },
  { value: 'ARCHIVED', label: 'Archived' },
]

/**
 * The sanitization answers, in the order a builder would be offered them.
 *
 * One question with one answer, where there used to be two controls: a
 * "Sanitization package" text box that printed on documents and an "Include
 * salt system" checkbox that priced. A project could say salt to the customer
 * and chlorine to the invoice, or (as shipped) tick salt and print a blank
 * Sanitization row on the proposal.
 *
 * The value is the words the proposal and the construction packet print, and
 * the salt option is also the one that adds the salt line to the quote. Storing
 * the label rather than a code is deliberate: every document reads this string
 * straight through, so the stored value has to be the printable one.
 */
const SANITIZATION_OPTIONS = ['Chlorine', SALT_SYSTEM_LABEL, 'UV', 'Ozone'] as const

/** Radix Select cannot hold an empty string, so "unanswered" needs a token. */
const UNSET = '__unset__'

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
  /**
   * Depth as the drawing holds it, which is the only place it is held. Null
   * when there is no pool on the canvas yet.
   */
  depth: { shallowFt: number; deepFt: number } | null
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
  depth,
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

  /**
   * Turning a priced option off takes its spec with it.
   *
   * The spec box is subordinate to the selection, so leaving "Pentair
   * MasterTemp 400" behind on a project with no heater is exactly the
   * disagreement this form exists to stop.
   */
  function setHeater(on: boolean) {
    dirty.current = true
    setForm((prev) => ({ ...prev, heaterSelected: on, heaterSelection: on ? prev.heaterSelection : '' }))
  }

  function setScreen(on: boolean) {
    dirty.current = true
    setForm((prev) => ({ ...prev, screenSelected: on, screenOption: on ? prev.screenOption : '' }))
  }

  function setLightingQuantity(qty: number) {
    dirty.current = true
    setForm((prev) => ({
      ...prev,
      lightingQuantity: qty,
      lightingSelection: qty > 0 ? prev.lightingSelection : '',
    }))
  }

  /** One answer, written to both the string that prints and the flag that prices. */
  function setSanitization(value: string) {
    dirty.current = true
    const answer = value === UNSET ? '' : value
    setForm((prev) => ({
      ...prev,
      sanitizationPackage: answer,
      saltSystemSelected: answer === SALT_SYSTEM_LABEL,
    }))
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

  // A stored answer that is not one of the offered ones (typed by hand before
  // this was a menu, or written by an image import) stays selectable rather
  // than being silently reset to blank the next time the form saves.
  const sanitizationChoices = SANITIZATION_OPTIONS.includes(
    form.sanitizationPackage as (typeof SANITIZATION_OPTIONS)[number],
  )
    ? [...SANITIZATION_OPTIONS]
    : form.sanitizationPackage.trim() !== ''
      ? [...SANITIZATION_OPTIONS, form.sanitizationPackage]
      : [...SANITIZATION_OPTIONS]

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            id="project-name"
            label="Name"
            value={form.name}
            onChange={(v) => update('name', v)}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="project-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => update('status', v as ProjectStatus)}
              name="project-status"
            >
              <SelectTrigger id="project-status">
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
          </div>
          <TextField
            id="project-salesperson"
            label="Salesperson"
            value={form.salesperson}
            onChange={(v) => update('salesperson', v)}
          />
          <TextField
            id="project-designer"
            label="Designer"
            value={form.designer}
            onChange={(v) => update('designer', v)}
          />
          <TextField
            id="project-proposal-expires"
            label="Proposal expires"
            type="date"
            value={form.proposalExpiresAt}
            onChange={(v) => update('proposalExpiresAt', v)}
          />
          <TextField
            id="project-internal-notes"
            label="Internal notes"
            full
            value={form.internalNotes}
            onChange={(v) => update('internalNotes', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* autoComplete values are the ones a browser recognises, so the
              address book can fill this block in one gesture. */}
          <TextField
            id="customer-name"
            label="Name"
            autoComplete="name"
            value={form.customerName}
            onChange={(v) => update('customerName', v)}
          />
          <TextField
            id="customer-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={form.customerEmail}
            onChange={(v) => update('customerEmail', v)}
          />
          <TextField
            id="customer-phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={form.customerPhone}
            onChange={(v) => update('customerPhone', v)}
          />
          <TextField
            id="customer-address"
            label="Job address"
            autoComplete="street-address"
            value={form.customerAddress}
            onChange={(v) => update('customerAddress', v)}
          />
          <TextField
            id="customer-notes"
            label="Customer notes"
            full
            value={form.customerNotes}
            onChange={(v) => update('customerNotes', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pool</CardTitle>
          <p className="text-sm text-muted-foreground">
            Size, shape and depth come from the drawing. What you set here is the finish
            schedule that prints on the proposal and the construction packet.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Read-only, and sourced from the one place depth lives. There used
              to be two free-text depth boxes here that drove nothing: the
              proposal printed the canvas depths, the checklist demanded these,
              and a single pool could report three different numbers. */}
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium leading-none">Depth</p>
            <p className="text-sm text-muted-foreground">
              {depth ? (
                <>
                  {formatFeet(depth.shallowFt)} shallow / {formatFeet(depth.deepFt)} deep, from the
                  pool in the drawing.{' '}
                </>
              ) : (
                <>No pool drawn yet, so there is no depth to report. </>
              )}
              <Link href={`/projects/${projectId}/editor`} className="text-primary hover:underline">
                Set it in the editor
              </Link>
              .
            </p>
          </div>
          <TextField
            id="pool-type"
            label="Pool type"
            value={form.poolType}
            onChange={(v) => update('poolType', v)}
          />
          <TextField
            id="pool-interior-finish"
            label="Interior finish"
            value={form.interiorFinish}
            onChange={(v) => update('interiorFinish', v)}
          />
          <TextField
            id="pool-coping-material"
            label="Coping material"
            value={form.copingMaterial}
            onChange={(v) => update('copingMaterial', v)}
          />
          <TextField
            id="pool-deck-material"
            label="Deck material"
            value={form.deckMaterial}
            onChange={(v) => update('deckMaterial', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipment and options</CardTitle>
          <p className="text-sm text-muted-foreground">
            These drive the quote, the checklist and the customer proposal. The model or spec
            under each one is printed on the documents; it never changes a price on its own.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              id="equipment-package"
              label="Equipment package"
              value={form.equipmentPackage}
              onChange={(v) => update('equipmentPackage', v)}
            />
            <div className="space-y-2">
              <Label htmlFor="equipment-sanitization">Sanitization</Label>
              <Select
                value={form.sanitizationPackage === '' ? UNSET : form.sanitizationPackage}
                onValueChange={setSanitization}
                name="equipment-sanitization"
              >
                <SelectTrigger id="equipment-sanitization">
                  <SelectValue placeholder="Not selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not selected</SelectItem>
                  {sanitizationChoices.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="equipment-sanitization-hint" className="text-xs text-muted-foreground">
                {form.saltSystemSelected
                  ? 'A salt system is on the quote and prints on the proposal.'
                  : 'Choosing a salt system adds it to the quote.'}
              </p>
            </div>
          </div>

          <Option
            id="option-heater"
            label="Include heater"
            checked={form.heaterSelected}
            onChange={setHeater}
            detailId="option-heater-model"
            detailLabel="Heater model or fuel"
            detailPlaceholder="e.g. Pentair MasterTemp 400, natural gas"
            detailValue={form.heaterSelection}
            onDetailChange={(v) => update('heaterSelection', v)}
          />

          <Option
            id="option-screen"
            label="Include screen enclosure"
            checked={form.screenSelected}
            onChange={setScreen}
            detailId="option-screen-spec"
            detailLabel="Mesh and cage spec"
            detailPlaceholder="e.g. 20/20 mesh, mansard, 12 ft"
            detailValue={form.screenOption}
            onDetailChange={(v) => update('screenOption', v)}
          />

          <div className="space-y-3">
            <div className="max-w-[12rem] space-y-2">
              <Label htmlFor="option-lighting-qty">Pool lights (qty)</Label>
              <Input
                id="option-lighting-qty"
                name="option-lighting-qty"
                type="number"
                min={0}
                value={form.lightingQuantity}
                onChange={(e) =>
                  setLightingQuantity(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
              />
            </div>
            <Detail
              id="option-lighting-model"
              label="Fixture model"
              placeholder="e.g. Pentair IntelliBrite 5G colour"
              value={form.lightingSelection}
              onChange={(v) => update('lightingSelection', v)}
              disabled={form.lightingQuantity <= 0}
              disabledHint="Set a quantity above to spec the fixture."
            />
          </div>
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

function formatFeet(ft: number): string {
  const rounded = Math.round(ft * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ft`
}

/**
 * A labelled text input, which is the only way this form makes one.
 *
 * Every control on the page used to be an `<Input>` next to a floating
 * `<Label>` with no `htmlFor`: 26 of them reported `id=""`, `name=""` and no
 * accessible name, so clicking a label focused nothing, a screen reader
 * announced nothing, and the browser could not autofill the customer block.
 * Taking the id as a required prop and wiring the label here means a new field
 * cannot be added without one.
 */
function TextField({
  id,
  label,
  value,
  onChange,
  type,
  autoComplete,
  placeholder,
  required,
  disabled,
  describedBy,
  full,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string | undefined
  autoComplete?: string | undefined
  placeholder?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  describedBy?: string | undefined
  full?: boolean | undefined
}) {
  return (
    <div className={`space-y-2 ${full ? 'md:col-span-2' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * A priced selection with its spec underneath.
 *
 * The layout is the argument: the checkbox is the question, the box below it is
 * indented, smaller, and dead until the box is ticked. The old form put the two
 * in separate cards under separate headings, which read as two questions and
 * let a builder answer the one that charges nobody.
 */
function Option({
  id,
  label,
  checked,
  onChange,
  detailId,
  detailLabel,
  detailPlaceholder,
  detailValue,
  onDetailChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  detailId: string
  detailLabel: string
  detailPlaceholder: string
  detailValue: string
  onDetailChange: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id={id} name={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      </div>
      <Detail
        id={detailId}
        label={detailLabel}
        placeholder={detailPlaceholder}
        value={detailValue}
        onChange={onDetailChange}
        disabled={!checked}
        disabledHint={`Tick “${label}” to spec it.`}
      />
    </div>
  )
}

/** The subordinate half: indented, quieter, and off until its parent is on. */
function Detail({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  disabledHint,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  disabledHint: string
}) {
  const hintId = `${id}-hint`
  return (
    <div className="ml-6 max-w-md space-y-1.5 border-l border-border pl-4">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        className="h-9"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {disabled ? disabledHint : 'Printed on the spec sheet. It does not change the price.'}
      </p>
    </div>
  )
}
