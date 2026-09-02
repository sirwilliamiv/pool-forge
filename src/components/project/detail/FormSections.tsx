'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { SALT_SYSTEM_LABEL } from '@/modules/projects/pool-fields'
import { AddressAutocomplete, type ResolvedAddress } from './AddressAutocomplete'
import { SiteMapThumb } from './SiteMapThumb'
import { Detail, Option, TeamMemberField, TextField } from './fields'
import type { ProjectSave } from './useProjectSave'

/**
 * The sanitization answers, in the order a builder would be offered them.
 * One question with one answer: the value is the words the documents print,
 * and the salt option is also the one that prices (see pool-fields.ts).
 */
const SANITIZATION_OPTIONS = ['Chlorine', SALT_SYSTEM_LABEL, 'UV', 'Ozone'] as const

/** Radix Select cannot hold an empty string, so "unanswered" needs a token. */
const UNSET = '__unset__'

/* ------------------------------------------------------- Site & customer */

export function SiteCustomerSection({
  save,
  mapsEnabled,
}: {
  save: ProjectSave
  mapsEnabled: boolean
}) {
  const { form } = save
  const [billingDifferent, setBillingDifferent] = React.useState(form.billingAddress.trim() !== '')

  function onAddressTyped(value: string) {
    // Hand-editing a resolved address makes the coordinates a claim about an
    // address that no longer exists; they go with the edit.
    if (form.sitePlaceId !== null || form.latitude !== null) {
      save.updatePatch({ siteAddress: value, sitePlaceId: null, latitude: null, longitude: null })
    } else {
      save.update('siteAddress', value)
    }
  }

  function onAddressResolved(resolved: ResolvedAddress) {
    save.updateNow({
      siteAddress: resolved.formattedAddress,
      sitePlaceId: resolved.placeId,
      latitude: resolved.lat,
      longitude: resolved.lng,
    })
  }

  function onBillingToggle(on: boolean) {
    setBillingDifferent(on)
    if (!on) save.updateNow({ billingAddress: '' })
  }

  return (
    <Card id="site">
      <CardHeader>
        <CardTitle>Site &amp; customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="min-w-0 flex-1">
            <AddressAutocomplete
              id="site-address"
              label="Site address"
              value={form.siteAddress}
              onChange={onAddressTyped}
              onResolved={onAddressResolved}
              mapsEnabled={mapsEnabled}
              describedBy="site-address-hint"
            />
            <p id="site-address-hint" className="mt-2 text-bodyS text-theme-muted">
              Locates the job and feeds the satellite underlay in the{' '}
              <span className="text-theme-fg">editor</span>. Documents print this address.
            </p>
          </div>
          {form.latitude !== null && form.longitude !== null ? (
            <SiteMapThumb
              lat={form.latitude}
              lng={form.longitude}
              address={form.siteAddress}
              width={224}
              height={126}
              className="shrink-0 self-start"
            />
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* autoComplete values are the ones a browser recognises, so the
              address book can fill this block in one gesture. */}
          <TextField
            id="customer-name"
            label="Customer name"
            autoComplete="name"
            value={form.customerName}
            onChange={(v) => save.update('customerName', v)}
          />
          <TextField
            id="customer-phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={form.customerPhone}
            onChange={(v) => save.update('customerPhone', v)}
          />
          <TextField
            id="customer-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={form.customerEmail}
            onChange={(v) => save.update('customerEmail', v)}
          />
          <TextField
            id="customer-notes"
            label="Customer notes"
            value={form.customerNotes}
            onChange={(v) => save.update('customerNotes', v)}
          />
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="billing-different"
                name="billing-different"
                checked={billingDifferent}
                onCheckedChange={(v) => onBillingToggle(v === true)}
              />
              <Label
                htmlFor="billing-different"
                className="font-display normal-case tracking-normal text-bodyL text-theme-fg"
              >
                Billing address is different
              </Label>
            </div>
            {billingDifferent ? (
              <div className="ml-6 max-w-md space-y-1.5 border-l border-theme-line pl-4">
                <Label htmlFor="billing-address" className="text-theme-faint">
                  Billing address
                </Label>
                <Input
                  id="billing-address"
                  name="billing-address"
                  className="h-9"
                  autoComplete="billing street-address"
                  value={form.billingAddress}
                  onChange={(e) => save.update('billingAddress', e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* --------------------------------------------------------------- Project */

export function ProjectSection({
  save,
  memberNames,
}: {
  save: ProjectSave
  memberNames: string[]
}) {
  const { form } = save
  return (
    <Card id="project">
      <CardHeader>
        <CardTitle>Project</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TeamMemberField
          id="project-salesperson"
          label="Salesperson"
          value={form.salesperson}
          onChange={(v) => save.update('salesperson', v)}
          memberNames={memberNames}
        />
        <TeamMemberField
          id="project-designer"
          label="Designer"
          value={form.designer}
          onChange={(v) => save.update('designer', v)}
          memberNames={memberNames}
        />
        <TextField
          id="project-proposal-expires"
          label="Proposal expires"
          type="date"
          value={form.proposalExpiresAt}
          onChange={(v) => save.update('proposalExpiresAt', v)}
        />
        <TextField
          id="project-jurisdiction"
          label="Permitting jurisdiction"
          placeholder="e.g. Hillsborough County, FL"
          value={form.jurisdiction}
          onChange={(v) => save.update('jurisdiction', v)}
        />
        <TextField
          id="project-parcel-id"
          label="Parcel ID"
          placeholder="e.g. 0412-3456-7890"
          value={form.parcelId}
          onChange={(v) => save.update('parcelId', v)}
        />
        <TextField
          id="project-internal-notes"
          label="Internal notes"
          value={form.internalNotes}
          onChange={(v) => save.update('internalNotes', v)}
        />
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ Pool */

export function PoolSection({
  save,
  depth,
  projectId,
}: {
  save: ProjectSave
  depth: { shallowFt: number; deepFt: number } | null
  projectId: string
}) {
  const { form } = save
  return (
    <Card id="pool">
      <CardHeader>
        <CardTitle>Pool</CardTitle>
        <CardDescription>
          Size, shape and depth come from the drawing. What you set here is the finish schedule
          that prints on the proposal and the construction packet.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Read-only, and sourced from the one place depth lives. */}
        <div className="space-y-2 md:col-span-2">
          <p className="font-brandMono text-formLabel uppercase text-theme-fg">Depth</p>
          <p className="text-bodyS text-theme-muted">
            {depth ? (
              <>
                {formatFeet(depth.shallowFt)} shallow / {formatFeet(depth.deepFt)} deep, from the
                pool in the drawing.{' '}
              </>
            ) : (
              <>No pool drawn yet, so there is no depth to report. </>
            )}
            <Link
              href={`/projects/${projectId}/editor`}
              className="text-theme-fg underline-offset-4 hover:underline"
            >
              Set it in the editor
            </Link>
            .
          </p>
        </div>
        <TextField
          id="pool-type"
          label="Pool type"
          value={form.poolType}
          onChange={(v) => save.update('poolType', v)}
        />
        <TextField
          id="pool-interior-finish"
          label="Interior finish"
          value={form.interiorFinish}
          onChange={(v) => save.update('interiorFinish', v)}
        />
        <TextField
          id="pool-coping-material"
          label="Coping material"
          value={form.copingMaterial}
          onChange={(v) => save.update('copingMaterial', v)}
        />
        <TextField
          id="pool-deck-material"
          label="Deck material"
          value={form.deckMaterial}
          onChange={(v) => save.update('deckMaterial', v)}
        />
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------- Equipment */

export function EquipmentSection({ save }: { save: ProjectSave }) {
  const { form } = save

  /** One answer, written to both the string that prints and the flag that prices. */
  function setSanitization(value: string) {
    const answer = value === UNSET ? '' : value
    save.updateNow({
      sanitizationPackage: answer,
      saltSystemSelected: answer === SALT_SYSTEM_LABEL,
    })
  }

  /** Turning a priced option off takes its spec with it (see pool-fields.ts). */
  function setHeater(on: boolean) {
    save.updateNow({ heaterSelected: on, heaterSelection: on ? form.heaterSelection : '' })
  }

  function setScreen(on: boolean) {
    save.updateNow({ screenSelected: on, screenOption: on ? form.screenOption : '' })
  }

  function setLightingQuantity(qty: number) {
    save.updateNow({
      lightingQuantity: qty,
      lightingSelection: qty > 0 ? form.lightingSelection : '',
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
    <Card id="equipment">
      <CardHeader>
        <CardTitle>Equipment and options</CardTitle>
        <CardDescription>
          These drive the quote, the checklist and the customer proposal. The model or spec under
          each one is printed on the documents; it never changes a price on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            id="equipment-package"
            label="Equipment package"
            value={form.equipmentPackage}
            onChange={(v) => save.update('equipmentPackage', v)}
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
            <p id="equipment-sanitization-hint" className="text-bodyS text-theme-muted">
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
          onDetailChange={(v) => save.update('heaterSelection', v)}
          checkbox={
            <Checkbox
              id="option-heater"
              name="option-heater"
              checked={form.heaterSelected}
              onCheckedChange={(v) => setHeater(v === true)}
            />
          }
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
          onDetailChange={(v) => save.update('screenOption', v)}
          checkbox={
            <Checkbox
              id="option-screen"
              name="option-screen"
              checked={form.screenSelected}
              onCheckedChange={(v) => setScreen(v === true)}
            />
          }
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
          {form.lightingQuantity > 0 ? (
            <Detail
              id="option-lighting-model"
              label="Fixture model"
              placeholder="e.g. Pentair IntelliBrite 5G colour"
              value={form.lightingSelection}
              onChange={(v) => save.update('lightingSelection', v)}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function formatFeet(ft: number): string {
  const rounded = Math.round(ft * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ft`
}
