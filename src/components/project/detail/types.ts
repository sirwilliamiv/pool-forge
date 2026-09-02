import type { ProjectStatus } from '@prisma/client'
import type { ProjectUpdateFields } from '@/modules/commands/categories/project'
import type { RackVersion } from '@/components/versions/VersionRack'
import type {
  PriceBookChoice,
  ProjectLineItemView,
} from '@/components/project/ProjectLineItems'

/** The editable fields, exactly as `project.update` writes them. */
export type ProjectDetailFields = ProjectUpdateFields

/**
 * Everything the server page hands the detail screen, loaded once.
 *
 * Serialisable throughout: this crosses the server/client boundary. Dates are
 * ISO strings, decimals are numbers, and the quote is reduced to the two facts
 * the header needs (is it priced, and for how much) rather than the full
 * QuoteSummary.
 */
export interface ProjectDetailData {
  projectId: string
  jobNumber: number | null
  status: ProjectStatus
  initial: ProjectDetailFields
  /** Coordinates when the stored address was geocoded; null when typed. */
  depth: { shallowFt: number; deepFt: number } | null
  hasShapes: boolean
  hasPool: boolean
  quote: {
    status: 'PRICED' | 'NOTHING_DRAWN' | 'NO_PRICE_BOOK'
    /** Dollars, as the pricing engine reports it. */
    total: number
  }
  /** Display names for the salesperson / designer pickers. */
  memberNames: string[]
  versions: RackVersion[]
  lineItems: ProjectLineItemView[]
  priceBookChoices: PriceBookChoice[]
  share: {
    token: string | null
    accepted: { name: string; at: string } | null
  }
  /** False when MAPS_API_KEY is absent: the address field degrades to text. */
  mapsEnabled: boolean
}

/**
 * The layout variants under comparison, one per `?layout=` value.
 *
 * 1 — sticky header + long page, autosave, docs in header group + full card
 * 2 — two columns with a summary rail, autosave, docs popover, designs strip
 * 3 — tabs, autosave including status (undo toast), docs popover
 * 4 — designs hero under the header, autosave, docs group + card
 * 5 — long page, explicit Save in header, docs card collapsed until priced
 */
export type LayoutId = 1 | 2 | 3 | 4 | 5

export const LAYOUT_IDS: readonly LayoutId[] = [1, 2, 3, 4, 5]

export interface LayoutSpec {
  shape: 'long' | 'rail' | 'tabs' | 'hero'
  save: 'auto' | 'manual'
  /** How a status change applies: confirm side-effectful moves, or undo toast. */
  statusModel: 'confirm' | 'undo'
  docs: 'group-and-card' | 'popover' | 'collapsed-card'
  designs: 'card' | 'strip' | 'hero'
}

export const LAYOUTS: Record<LayoutId, LayoutSpec> = {
  1: { shape: 'long', save: 'auto', statusModel: 'confirm', docs: 'group-and-card', designs: 'card' },
  2: { shape: 'rail', save: 'auto', statusModel: 'confirm', docs: 'popover', designs: 'strip' },
  3: { shape: 'tabs', save: 'auto', statusModel: 'undo', docs: 'popover', designs: 'card' },
  4: { shape: 'hero', save: 'auto', statusModel: 'confirm', docs: 'group-and-card', designs: 'hero' },
  5: { shape: 'long', save: 'manual', statusModel: 'confirm', docs: 'collapsed-card', designs: 'strip' },
}
