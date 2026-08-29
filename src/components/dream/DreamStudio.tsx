'use client'

// The studio.
//
// One piece of state, the `DreamConfig`, and everything on screen is derived
// from it: the drawing, the ballpark, the nudges, the share link. That is worth
// stating because it is what keeps the page honest. There is no separate
// "display price" that could drift from the priced design, and no way to be
// shown a number for a pool other than the one drawn above it.
//
// Pricing runs in the browser, on the real `computeQuote`, exactly as the
// editor's live quote does. A round trip per click would put a spinner between
// a homeowner and the answer they came for, and the answer is the product.

import { useCallback, useMemo, useState } from 'react'

import {
  BUDGETS,
  DECK_MATERIALS,
  DECK_SIZES,
  DEPTH_PROFILES,
  INTERIOR_FINISHES,
  MAX_LIGHTS,
  MAX_WATER_FEATURES,
  POOL_SHAPES,
  POOL_SIZES,
} from '@/modules/dream/catalog'
import type { DreamConfig } from '@/modules/dream/config'
import { dreamNudges } from '@/modules/dream/nudges'
import {
  priceDream,
  REFERENCE_PRICE_NOTICE,
  REFERENCE_PRICE_NOTICE_SHORT,
} from '@/modules/dream/pricing'
import { encodeDream } from '@/modules/dream/share'
import { budgetVerdict, spreadReasons } from '@/modules/dream/spread'
import { layoutYard } from '@/modules/dream/yard'

import { ChoiceGroup, CountChoice, Field, ToggleChoice } from './ChoiceGroup'
import { RollingMoney } from './RollingMoney'
import { SendPanel } from './SendPanel'
import { YardPlan } from './YardPlan'

export function DreamStudio({ initial }: { initial: DreamConfig }) {
  const [config, setConfig] = useState<DreamConfig>(initial)

  const set = useCallback(<K extends keyof DreamConfig>(key: K, value: DreamConfig[K]) => {
    setConfig((previous) => ({ ...previous, [key]: value }))
  }, [])

  const ballpark = useMemo(() => priceDream(config), [config])
  const verdict = useMemo(() => budgetVerdict(config, ballpark), [config, ballpark])
  const layout = useMemo(
    () => layoutYard(config, ballpark.measurements.lightCount),
    [config, ballpark.measurements.lightCount],
  )
  const nudges = useMemo(
    () =>
      dreamNudges({
        config,
        poolAreaSqft: ballpark.measurements.poolSurfaceArea,
        deckAreaSqft: ballpark.measurements.deckArea,
        verdict,
      }),
    [config, ballpark.measurements, verdict],
  )
  const reasons = useMemo(() => spreadReasons(config), [config])

  const code = encodeDream(config)
  const shareUrl = useMemo(() => {
    // Built in the browser so it carries whatever host the visitor is actually
    // on. A hardcoded origin is how a share link ends up pointing at staging.
    if (typeof window === 'undefined') return `/dream/${code}`
    return `${window.location.origin}/dream/${code}`
  }, [code])

  /**
   * What one option would do to the total, against the design as it stands.
   *
   * Recomputed per option rather than looked up from a table, because the
   * answer genuinely depends on the rest of the design: travertine costs more
   * on a big deck than a small one, and a fixed "+$4,000" would be a lie on
   * most pools. This is a handful of pure arithmetic passes and nothing here
   * touches the network.
   */
  const deltaAgainst = useCallback(
    <K extends keyof DreamConfig>(key: K) =>
      (optionId: string): string | null => {
        const candidate = { ...config, [key]: optionId as DreamConfig[K] }
        const difference = priceDream(candidate).exact - ballpark.exact
        if (Math.abs(difference) < 400) return null
        return formatDelta(difference)
      },
    [config, ballpark.exact],
  )

  const optionPrice = useCallback(
    (change: Partial<DreamConfig>): string => {
      const candidate = { ...config, ...change }
      return formatDelta(priceDream(candidate).exact - ballpark.exact)
    },
    [config, ballpark.exact],
  )

  return (
    <div className="dream">
      <SheetHeader lengthFt={ballpark.measurements.poolLengthFt} widthFt={ballpark.measurements.poolWidthFt} />

      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 pb-40 pt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-6">
        {/* The drawing stays put while the choices scroll past it. Watching the
            pool change is the entire loop, and a plan that scrolls off the top
            makes every click below it an act of faith. */}
        <main className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          {/* The lawn, not white. On a narrow screen the plan is capped in
              height and letterboxes inside this box, and a white bar either
              side of the yard reads as a broken image rather than as a drawing
              that has been scaled down. */}
          <div className="border dream-rule" style={{ background: layout.colors.grass }}>
            <YardPlan
              layout={layout}
              lengthFt={ballpark.measurements.poolLengthFt}
              widthFt={ballpark.measurements.poolWidthFt}
              deepFt={ballpark.measurements.poolDepthDeep}
            />
          </div>

          <PlanFigures
            gallons={ballpark.measurements.poolGallons}
            poolArea={ballpark.measurements.poolSurfaceArea}
            deckArea={ballpark.measurements.deckArea}
            perimeter={ballpark.measurements.poolPerimeter}
          />

          {nudges.length > 0 && (
            <ul className="mt-5 grid gap-2">
              {nudges.slice(0, 3).map((nudge) => (
                <li
                  key={nudge.id}
                  className="border-l-2 py-1.5 pl-3 text-[13px] leading-snug"
                  style={{
                    borderColor: nudge.tone === 'fix' ? 'var(--redline)' : 'var(--rule)',
                    color: nudge.tone === 'fix' ? 'var(--graphite)' : 'var(--pencil)',
                  }}
                >
                  {nudge.text}
                </li>
              ))}
            </ul>
          )}

          <Breakdown lines={ballpark.quote.lineItems} reasons={reasons} spread={ballpark.spread} />
        </main>

        <aside className="min-w-0">
          <ChoiceGroup
            label="Shape"
            options={POOL_SHAPES}
            value={config.shape}
            onChange={(id) => set('shape', id)}
            deltaFor={deltaAgainst('shape')}
          />
          <ChoiceGroup
            label="Size"
            options={POOL_SIZES}
            value={config.size}
            onChange={(id) => set('size', id)}
            deltaFor={deltaAgainst('size')}
          />
          <ChoiceGroup
            label="Depth"
            options={DEPTH_PROFILES}
            value={config.depth}
            onChange={(id) => set('depth', id)}
            deltaFor={deltaAgainst('depth')}
          />
          <ChoiceGroup
            label="Inside the pool"
            options={INTERIOR_FINISHES}
            value={config.finish}
            onChange={(id) => set('finish', id)}
            deltaFor={deltaAgainst('finish')}
          />
          <ChoiceGroup
            label="How much paving"
            options={DECK_SIZES}
            value={config.deckSize}
            onChange={(id) => set('deckSize', id)}
            deltaFor={deltaAgainst('deckSize')}
          />
          <ChoiceGroup
            label="Paving material"
            options={DECK_MATERIALS}
            value={config.deckMaterial}
            onChange={(id) => set('deckMaterial', id)}
            deltaFor={deltaAgainst('deckMaterial')}
          />

          <Field label="The good things">
            <div className="grid gap-2">
              <ToggleChoice
                label="Spa"
                blurb="Warm water off the side of the pool, spilling back in."
                price={optionPrice({ spa: !config.spa })}
                checked={config.spa}
                onChange={(next) => set('spa', next)}
              />
              <ToggleChoice
                label="Heater"
                blurb="Turns a summer pool into one you use most of the year."
                price={optionPrice({ heater: !config.heater })}
                checked={config.heater}
                onChange={(next) => set('heater', next)}
              />
              <ToggleChoice
                label="Saltwater"
                blurb="Softer water, less chlorine to buy and store."
                price={optionPrice({ saltwater: !config.saltwater })}
                checked={config.saltwater}
                onChange={(next) => set('saltwater', next)}
              />
              <ToggleChoice
                label="Screen enclosure"
                blurb="Keeps the leaves and the mosquitoes out. The biggest line here."
                price={optionPrice({ screenEnclosure: !config.screenEnclosure })}
                checked={config.screenEnclosure}
                onChange={(next) => set('screenEnclosure', next)}
              />
              <CountChoice
                label="Water features"
                blurb="Bowls or sheer descents on the far wall."
                price={optionPrice({ waterFeatures: Math.min(MAX_WATER_FEATURES, config.waterFeatures + 1) })}
                value={config.waterFeatures}
                max={MAX_WATER_FEATURES}
                onChange={(next) => set('waterFeatures', next)}
              />
              <CountChoice
                label="Extra lights"
                blurb="Beyond the ones the pool needs to swim at night."
                price={optionPrice({ extraLights: Math.min(MAX_LIGHTS, config.extraLights + 1) })}
                value={config.extraLights}
                max={MAX_LIGHTS}
                onChange={(next) => set('extraLights', next)}
              />
            </div>
          </Field>

          <ChoiceGroup
            label="What were you hoping to spend"
            options={BUDGETS}
            value={config.budget}
            onChange={(id) => set('budget', id)}
            columns={2}
          />

          <SendPanel
            design={code}
            ballparkLow={ballpark.low}
            ballparkHigh={ballpark.high}
            shareUrl={shareUrl}
          />
        </aside>
      </div>

      <TitleBlock
        low={ballpark.low}
        high={ballpark.high}
        verdict={verdict}
        code={code}
        notice={REFERENCE_PRICE_NOTICE}
      />
    </div>
  )
}

/** The top of the sheet. Says what this is and what it is not, in one line. */
function SheetHeader({ lengthFt, widthFt }: { lengthFt: number; widthFt: number }) {
  return (
    <header className="border-b dream-rule">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 lg:px-6">
        <span className="dream-annotation text-[10px]" style={{ color: 'var(--pencil)' }}>
          Pool Forge · Dream sheet
        </span>
        <span className="dream-annotation text-[10px]" style={{ color: 'var(--pencil-light)' }}>
          {Math.round(lengthFt)}&prime; &times; {Math.round(widthFt)}&prime; · plan view · not to scale
        </span>
      </div>
      <div className="mx-auto max-w-[1240px] px-4 pb-5 lg:px-6">
        <h1 className="max-w-[19ch] text-[30px] font-semibold leading-[1.06] tracking-[-0.02em] sm:text-[38px]">
          Build the backyard. See what it costs.
        </h1>
        <p className="mt-2 max-w-[54ch] text-[14px] leading-snug" style={{ color: 'var(--pencil)' }}>
          Nobody in this industry will tell you a number until you have sat through a sales
          visit. Change anything below and the price moves while you watch.
        </p>
      </div>
    </header>
  )
}

/** The measured figures, set as a drawing's schedule rather than as stats. */
function PlanFigures({
  gallons,
  poolArea,
  deckArea,
  perimeter,
}: {
  gallons: number
  poolArea: number
  deckArea: number
  perimeter: number
}) {
  const figures = [
    { label: 'Water', value: `${Math.round(gallons).toLocaleString('en-US')} gal` },
    { label: 'Pool', value: `${Math.round(poolArea)} sq ft` },
    { label: 'Paving', value: `${Math.round(deckArea)} sq ft` },
    { label: 'Edge', value: `${Math.round(perimeter)} lf` },
  ]
  return (
    <dl className="mt-4 grid grid-cols-2 gap-px border sm:grid-cols-4 dream-rule" style={{ background: 'var(--rule)' }}>
      {figures.map((figure) => (
        <div key={figure.label} className="px-3 py-2.5" style={{ background: '#fff' }}>
          <dt className="dream-annotation text-[9.5px]" style={{ color: 'var(--pencil-light)' }}>
            {figure.label}
          </dt>
          <dd className="dream-annotation mt-0.5 text-[14px]">{figure.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Where the money goes, and what the range is admitting to. */
function Breakdown({
  lines,
  reasons,
  spread,
}: {
  lines: readonly { itemId: string; name: string; total: number }[]
  reasons: readonly string[]
  spread: number
}) {
  const sorted = [...lines].sort((a, b) => b.total - a.total).filter((line) => line.total > 0)

  return (
    <details className="mt-6 border dream-rule" style={{ background: '#fff' }}>
      <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-medium">
        Where the money goes
      </summary>
      <div className="border-t px-4 py-3 dream-rule">
        <ul className="grid gap-1.5">
          {sorted.map((line) => (
            <li key={line.itemId} className="flex items-baseline justify-between gap-4 text-[13px]">
              <span style={{ color: 'var(--pencil)' }}>{line.name}</span>
              <span className="dream-annotation shrink-0 text-[12px]">
                ${Math.round(line.total).toLocaleString('en-US')}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t pt-3 dream-rule">
          <p className="dream-annotation text-[9.5px]" style={{ color: 'var(--pencil-light)' }}>
            Why the range is {Math.round(spread * 100)}% either way
          </p>
          <ul className="mt-1.5 grid gap-1 text-[12.5px]" style={{ color: 'var(--pencil)' }}>
            <li>Ground, access, permits and local labour rates, on every job.</li>
            {reasons.map((reason) => (
              <li key={reason}>{reason}.</li>
            ))}
          </ul>
          {/* The full notice, in the one place on the page that is always
              available at every screen size. The title block carries the short
              form on a phone. */}
          <p className="mt-3 text-[12px] leading-snug" style={{ color: 'var(--pencil-light)' }}>
            {REFERENCE_PRICE_NOTICE}
          </p>
        </div>
      </div>
    </details>
  )
}

/**
 * The title block.
 *
 * On a real drawing sheet this is the panel at the bottom carrying the job, the
 * scale and the revision: the facts that are true of the whole drawing rather
 * than of any one part of it. The ballpark belongs there for exactly that
 * reason, and putting it there rather than in a floating "your price" pill is
 * what keeps the page reading as a document instead of a checkout.
 */
function TitleBlock({
  low,
  high,
  verdict,
  code,
  notice,
}: {
  low: number
  high: number
  verdict: ReturnType<typeof budgetVerdict>
  code: string
  notice: string
}) {
  const filled = verdict === null ? 0 : Math.min(100, Math.round(verdict.usedFraction * 100))

  return (
    <div
      className="fixed inset-x-0 bottom-0 border-t"
      style={{ background: 'var(--paper)', borderColor: 'var(--graphite)' }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-x-8 gap-y-3 px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <p className="dream-annotation text-[9.5px]" style={{ color: 'var(--pencil)' }}>
            Ballpark · {code}
          </p>
          <p className="dream-money mt-0.5 text-[26px] font-semibold leading-none sm:text-[32px]">
            <RollingMoney value={low} />
            <span style={{ color: 'var(--pencil-light)' }}> to </span>
            <RollingMoney value={high} />
          </p>
        </div>

        {verdict !== null ? (
          <div className="min-w-[200px] flex-1 sm:max-w-[320px]">
            <div className="flex items-baseline justify-between">
              <span className="dream-annotation text-[9.5px]" style={{ color: 'var(--pencil)' }}>
                {verdict.kind === 'over'
                  ? 'Past your budget'
                  : verdict.kind === 'tight'
                    ? 'Close to your budget'
                    : 'Inside your budget'}
              </span>
              <span className="dream-annotation text-[9.5px]" style={{ color: 'var(--pencil-light)' }}>
                of ${Math.round(verdict.ceiling / 1000)}k
              </span>
            </div>
            <div className="dream-budget-track mt-1.5 h-2.5 w-full overflow-hidden">
              <div
                className="dream-budget-fill h-full"
                data-state={verdict.kind}
                style={{ width: `${filled}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="max-w-[46ch] text-[11.5px] leading-snug" style={{ color: 'var(--pencil)' }}>
            {/* The full paragraph needs room to be read rather than skimmed. On
                a phone it would crowd the figure it qualifies, so the short
                form stands in and the long one lives in the breakdown. */}
            <span className="hidden sm:inline">{notice}</span>
            <span className="sm:hidden">{REFERENCE_PRICE_NOTICE_SHORT}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/** "+$4,500" / "&minus;$1,200". Rounded, because a delta is a signal, not an invoice. */
function formatDelta(difference: number): string {
  const rounded = Math.round(Math.abs(difference) / 100) * 100
  if (rounded === 0) return 'no change'
  const sign = difference > 0 ? '+' : '−'
  return `${sign}$${rounded.toLocaleString('en-US')}`
}
