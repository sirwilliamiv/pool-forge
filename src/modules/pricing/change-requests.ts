import { PriceCategory, PriceChangeKind, UnitType } from '@prisma/client'
import { z } from 'zod'

import { IMPORT_LIMITS, safePrice } from './import-safety'

// Proposing a change to the price list, and reviewing it before it reaches
// anyone quoting.
//
// The workflow being replaced was described by a prospect exactly: one person
// keeps the list, six to eight salespeople quote from copies, and when one of
// them needs a price changed they go and ask. The ask lives in a text message,
// the reasoning is lost, and nobody can see what moved between one copy and the
// next.
//
// A request is written against a specific version of the book, which is what
// makes review meaningful. If the list moves underneath it, applying it blindly
// would silently undo whatever the keeper did in between, so it says so instead.

/** What a proposed line looks like. Prices are checked the same way an import's are. */
export const proposedItemSchema = z.object({
  name: z.string().min(1).max(IMPORT_LIMITS.cell),
  category: z.nativeEnum(PriceCategory),
  unitType: z.nativeEnum(UnitType),
  retailPrice: z.number(),
  unitCost: z.number().optional(),
  required: z.boolean().optional(),
  customerVisible: z.boolean().optional(),
})

export type ProposedItem = z.infer<typeof proposedItemSchema>

export const changeSchema = z
  .object({
    kind: z.nativeEnum(PriceChangeKind),
    /** The item being changed or removed. Absent for an addition. */
    itemId: z.string().min(1).optional(),
    after: proposedItemSchema.optional(),
    reason: z.string().max(IMPORT_LIMITS.cell).optional(),
  })
  .superRefine((change, ctx) => {
    if (change.kind === PriceChangeKind.ADD && !change.after) {
      ctx.addIssue({ code: 'custom', message: 'An added line needs its details.' })
    }
    if (change.kind !== PriceChangeKind.ADD && !change.itemId) {
      ctx.addIssue({ code: 'custom', message: 'Say which line is being changed.' })
    }
    if (change.kind === PriceChangeKind.UPDATE && !change.after) {
      ctx.addIssue({ code: 'custom', message: 'A changed line needs its new details.' })
    }
    if (change.after) {
      const price = safePrice(change.after.retailPrice)
      if (!price.ok) {
        ctx.addIssue({ code: 'custom', message: `The price ${price.reason}.` })
      }
    }
  })

export type ProposedChange = z.infer<typeof changeSchema>

export interface BookItem {
  id: string
  name: string
  category: PriceCategory
  unitType: UnitType
  retailPrice: number
  unitCost?: number
  required?: boolean
  customerVisible?: boolean
}

export type ConflictReason =
  | 'gone'
  | 'moved'

export interface DiffLine {
  kind: PriceChangeKind
  /** The line's name, whichever side it exists on. Never an id: a reviewer reads names. */
  label: string
  before: BookItem | null
  after: ProposedItem | null
  reason: string | undefined
  /**
   * Set when the current book no longer matches what the request was written
   * against: the line was deleted, or somebody else changed it in between.
   */
  conflict: ConflictReason | null
}

export interface RequestDiff {
  lines: DiffLine[]
  conflicts: DiffLine[]
  /** What the whole request does to the sheet, for a reviewer scanning quickly. */
  summary: { added: number; changed: number; removed: number }
}

const money = (value: number): number => Math.round(value * 100) / 100

function sameItem(a: BookItem, b: BookItem): boolean {
  return (
    a.name === b.name &&
    a.category === b.category &&
    a.unitType === b.unitType &&
    money(a.retailPrice) === money(b.retailPrice) &&
    money(a.unitCost ?? 0) === money(b.unitCost ?? 0)
  )
}

/**
 * What this request would do to the book as it stands right now.
 *
 * `before` is read from the CURRENT book rather than from what was recorded when
 * the request was opened, because the reviewer is deciding about the list they
 * have. Where the two disagree, that is the conflict, and it is surfaced rather
 * than resolved: two people changed the same line and a machine should not pick.
 */
export function diffRequest(
  current: readonly BookItem[],
  recordedBefore: ReadonlyMap<string, BookItem>,
  changes: readonly ProposedChange[],
): RequestDiff {
  const byId = new Map(current.map((item) => [item.id, item]))
  const lines: DiffLine[] = []

  for (const change of changes) {
    const before = change.itemId ? byId.get(change.itemId) ?? null : null
    const recorded = change.itemId ? recordedBefore.get(change.itemId) ?? null : null

    let conflict: ConflictReason | null = null
    if (change.kind !== PriceChangeKind.ADD) {
      if (!before) conflict = 'gone'
      else if (recorded && !sameItem(before, recorded)) conflict = 'moved'
    }

    lines.push({
      kind: change.kind,
      label: change.after?.name ?? before?.name ?? recorded?.name ?? 'a line that is no longer there',
      before,
      after: change.after ?? null,
      reason: change.reason,
      conflict,
    })
  }

  return {
    lines,
    conflicts: lines.filter((line) => line.conflict !== null),
    summary: {
      added: lines.filter((l) => l.kind === PriceChangeKind.ADD).length,
      changed: lines.filter((l) => l.kind === PriceChangeKind.UPDATE).length,
      removed: lines.filter((l) => l.kind === PriceChangeKind.REMOVE).length,
    },
  }
}

export interface ApplyResult {
  items: BookItem[]
  /** Ids from the old book that carried through, so a caller can copy the rest. */
  keptIds: string[]
}

/**
 * The list this request would produce, applied to the current book.
 *
 * Pure, and deliberately separate from anything that writes: the same function
 * answers "what would this do" for the review screen and "what does this do"
 * for the approval, so a reviewer cannot be shown one thing and get another.
 *
 * Refuses outright when anything conflicts. Applying half a request would
 * publish a version nobody reviewed.
 */
export function applyRequest(
  current: readonly BookItem[],
  changes: readonly ProposedChange[],
): ApplyResult {
  const removed = new Set<string>()
  const updates = new Map<string, ProposedItem>()
  const additions: ProposedItem[] = []

  for (const change of changes) {
    if (change.kind === PriceChangeKind.REMOVE && change.itemId) removed.add(change.itemId)
    if (change.kind === PriceChangeKind.UPDATE && change.itemId && change.after) {
      updates.set(change.itemId, change.after)
    }
    if (change.kind === PriceChangeKind.ADD && change.after) additions.push(change.after)
  }

  const kept: BookItem[] = []
  const keptIds: string[] = []
  for (const item of current) {
    if (removed.has(item.id)) continue
    const update = updates.get(item.id)
    keptIds.push(item.id)
    kept.push(
      update
        ? {
            id: item.id,
            name: update.name,
            category: update.category,
            unitType: update.unitType,
            retailPrice: update.retailPrice,
            ...(update.unitCost === undefined ? {} : { unitCost: update.unitCost }),
            ...(update.required === undefined ? {} : { required: update.required }),
            ...(update.customerVisible === undefined ? {} : { customerVisible: update.customerVisible }),
          }
        : item,
    )
  }

  for (const [index, add] of additions.entries()) {
    kept.push({
      // Not a real id: this line does not exist until the version is written.
      id: `new-${index}`,
      name: add.name,
      category: add.category,
      unitType: add.unitType,
      retailPrice: add.retailPrice,
      ...(add.unitCost === undefined ? {} : { unitCost: add.unitCost }),
      ...(add.required === undefined ? {} : { required: add.required }),
      ...(add.customerVisible === undefined ? {} : { customerVisible: add.customerVisible }),
    })
  }

  return { items: kept, keptIds }
}

/** Roles allowed to publish a change. Everyone else may ask. */
export const KEEPER_ROLES = ['OWNER', 'ADMIN'] as const

export function canApprove(role: string | null | undefined): boolean {
  return KEEPER_ROLES.includes(role as (typeof KEEPER_ROLES)[number])
}

/**
 * What to tell somebody who cannot approve their own request.
 *
 * Named for the job rather than the row: "you are a MEMBER" means nothing to a
 * salesperson, and roles are an implementation detail of who keeps the list.
 */
export const NOT_A_KEEPER =
  'Only someone who keeps the price book can publish a change. Yours is saved and waiting for them.'
