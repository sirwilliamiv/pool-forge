// The three things that stand between a new account and a proposal worth
// sending.
//
// Not a tour. A builder who has bought a design tool does not want to be walked
// around it, and an overlay that has to be clicked through before the app can
// be used is the single most reliably hated pattern in this category. This is a
// quiet card on the projects page that names three facts, links to each of
// them, ticks itself off as they become true, and closes for good when the
// builder says so.
//
// The three are not arbitrary. Each one is something that is empty on a new
// organisation and that a customer would see:
//
//   1. The price book starts with placeholder numbers. Send a proposal built on
//      them and you have quoted somebody else's guess.
//   2. Address, phone and licence number are printed by `ProposalDocument` and
//      are null on a new organisation, so the document goes out with a blank
//      where a contractor licence is legally expected in Florida.
//   3. Nothing is drawn, so there is nothing to price.

import { db } from '@/lib/db'
import { unchangedStarterLines } from './starter-price-book'

/** Where the dismissal lives. `AppSetting` is org scoped and already exists. */
export const FIRST_RUN_SETTING_KEY = 'onboarding.firstRun'

export type FirstRunStepId = 'price-book' | 'company' | 'drawing'

export interface FirstRunStep {
  id: FirstRunStepId
  title: string
  /** One sentence saying why it matters, or what is still outstanding. */
  detail: string
  done: boolean
  href: string
  cta: string
}

/** The facts the checklist is derived from. Separated so it can be tested. */
export interface FirstRunFacts {
  /** Lines in the active book still sitting at our placeholder numbers. */
  placeholderLines: number
  /** Lines in the active book, whatever their prices. */
  priceBookLines: number
  hasAddress: boolean
  hasPhone: boolean
  hasLicenseNumber: boolean
  /** Any drawing in this organisation with at least one shape on it. */
  hasDrawnShapes: boolean
}

function missingCompanyFields(facts: FirstRunFacts): string[] {
  const missing: string[] = []
  if (!facts.hasAddress) missing.push('address')
  if (!facts.hasPhone) missing.push('phone')
  if (!facts.hasLicenseNumber) missing.push('licence number')
  return missing
}

function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** The checklist as a pure function of the facts. */
export function buildFirstRunSteps(facts: FirstRunFacts): FirstRunStep[] {
  const missing = missingCompanyFields(facts)

  const priceBookDone = facts.priceBookLines > 0 && facts.placeholderLines === 0
  const priceBookDetail =
    facts.priceBookLines === 0
      ? 'Your price book is empty, so every quote will say it cannot be priced.'
      : facts.placeholderLines === 0
        ? 'Every starting price has been replaced with one of yours.'
        : `${facts.placeholderLines} of your prices are still the placeholder numbers Pool Forge created. They are not a recommendation about what to charge.`

  return [
    {
      id: 'price-book',
      title: 'Make the price book yours',
      detail: priceBookDetail,
      done: priceBookDone,
      href: '/settings/price-book',
      cta: 'Open the price book',
    },
    {
      id: 'company',
      title: 'Fill in your company details',
      detail:
        missing.length === 0
          ? 'Your address, phone and licence number print on every proposal.'
          : `Your proposal prints your ${listOf(missing)}, and ${missing.length === 1 ? 'it is' : 'they are'} blank.`,
      done: missing.length === 0,
      href: '/settings/company',
      cta: 'Add company details',
    },
    {
      id: 'drawing',
      title: 'Draw something',
      detail: facts.hasDrawnShapes
        ? 'You have a drawing with scope on it.'
        : 'A quote is priced from the drawing, so an empty canvas has nothing to add up.',
      done: facts.hasDrawnShapes,
      href: '/dashboard',
      cta: 'Start a project',
    },
  ]
}

export interface FirstRunState {
  steps: FirstRunStep[]
  dismissed: boolean
  /** Steps still outstanding. */
  remaining: number
  /** Whether the card should be on the page at all. */
  visible: boolean
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

interface RootJsonWithShapes {
  shapes?: unknown
}

function drawingHasShapes(rootJson: unknown): boolean {
  if (typeof rootJson !== 'object' || rootJson === null) return false
  const shapes = (rootJson as RootJsonWithShapes).shapes
  return Array.isArray(shapes) && shapes.length > 0
}

/** Read the facts for one organisation. Every query is org scoped. */
export async function loadFirstRunFacts(orgId: string): Promise<FirstRunFacts> {
  const [book, org, drawings] = await Promise.all([
    db.priceBook.findFirst({
      where: { orgId, isActive: true },
      orderBy: { version: 'desc' },
      select: {
        items: {
          select: {
            category: true,
            name: true,
            unitType: true,
            unitCost: true,
            retailPrice: true,
          },
        },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { address: true, phone: true, licenseNumber: true },
    }),
    // Only enough to answer "has anybody drawn anything yet". Capped, because
    // this runs on every render of the projects page.
    db.drawing.findMany({
      where: { project: { orgId } },
      select: { rootJson: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
  ])

  const stored = (book?.items ?? []).map((item) => ({
    category: item.category,
    name: item.name,
    unitType: item.unitType,
    unitCost: Number(item.unitCost),
    retailPrice: Number(item.retailPrice),
  }))

  return {
    placeholderLines: unchangedStarterLines(stored).length,
    priceBookLines: stored.length,
    hasAddress: hasText(org?.address),
    hasPhone: hasText(org?.phone),
    hasLicenseNumber: hasText(org?.licenseNumber),
    hasDrawnShapes: drawings.some((drawing) => drawingHasShapes(drawing.rootJson)),
  }
}

/** Has this organisation closed the card? */
export async function isFirstRunDismissed(orgId: string): Promise<boolean> {
  const row = await db.appSetting.findUnique({
    where: { orgId_key: { orgId, key: FIRST_RUN_SETTING_KEY } },
    select: { value: true },
  })
  if (!row) return false
  const value = row.value
  if (typeof value !== 'object' || value === null) return false
  return (value as { dismissed?: unknown }).dismissed === true
}

/**
 * The card's whole state.
 *
 * Hidden once every step is done, whether or not anybody pressed dismiss: a
 * checklist with nothing left on it is clutter.
 */
export async function loadFirstRun(orgId: string): Promise<FirstRunState> {
  const [facts, dismissed] = await Promise.all([
    loadFirstRunFacts(orgId),
    isFirstRunDismissed(orgId),
  ])
  const steps = buildFirstRunSteps(facts)
  const remaining = steps.filter((step) => !step.done).length
  return { steps, dismissed, remaining, visible: !dismissed && remaining > 0 }
}

/** Close the card for this organisation. Reached through the command registry. */
export async function dismissFirstRun(orgId: string): Promise<void> {
  const value = { dismissed: true, dismissedAt: new Date().toISOString() }
  await db.appSetting.upsert({
    where: { orgId_key: { orgId, key: FIRST_RUN_SETTING_KEY } },
    create: { orgId, key: FIRST_RUN_SETTING_KEY, value },
    update: { value },
  })
}
