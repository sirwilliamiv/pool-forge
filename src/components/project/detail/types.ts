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
