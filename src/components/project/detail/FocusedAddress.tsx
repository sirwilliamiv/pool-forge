'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddressAutocomplete, type ResolvedAddress } from './AddressAutocomplete'
import { TextField } from './fields'
import type { ProjectSave } from './useProjectSave'

/**
 * The state a new project opens in: one question, asked properly.
 *
 * The address is the field that locates the job and unlocks the satellite
 * underlay, so until it exists the rest of the page would be nine cards of
 * nothing. Name and phone ride along because they arrive in the same phone
 * call. "Skip for now" is quiet on purpose — it is an escape hatch, not a
 * peer of the question.
 */
export function FocusedAddress({
  save,
  mapsEnabled,
  onDone,
  onSkip,
}: {
  save: ProjectSave
  mapsEnabled: boolean
  onDone: () => void
  onSkip: () => void
}) {
  const { form } = save

  function onResolved(resolved: ResolvedAddress) {
    save.updateNow({
      siteAddress: resolved.formattedAddress,
      sitePlaceId: resolved.placeId,
      latitude: resolved.lat,
      longitude: resolved.lng,
    })
    onDone()
  }

  return (
    <div className="mx-auto w-full max-w-xl pt-16">
      <Card>
        <CardHeader>
          <CardTitle>Where is this pool going?</CardTitle>
          <CardDescription>
            The address locates the job, feeds the satellite underlay in the editor, and prints on
            every document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <AddressAutocomplete
            id="site-address"
            label="Site address"
            value={form.siteAddress}
            onChange={(v) => save.update('siteAddress', v)}
            onResolved={onResolved}
            mapsEnabled={mapsEnabled}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSkip}
              className="text-bodyS text-theme-muted underline-offset-4 transition-colors duration-brand ease-brand hover:text-theme-fg hover:underline"
            >
              Skip for now
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
