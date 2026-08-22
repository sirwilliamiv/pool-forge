import type { ValidationContext, ValidationItem, ValidationRule } from './types'

interface FailOpts {
  field?: string | undefined
  targetId?: string | undefined
  suggestedFix?: string | undefined
}

function fail(
  id: string,
  level: 'warn' | 'error',
  category: ValidationItem['category'],
  message: string,
  opts: FailOpts = {},
): ValidationItem {
  const item: ValidationItem = { id, level, category, message }
  if (opts.field !== undefined) item.field = opts.field
  if (opts.targetId !== undefined) item.targetId = opts.targetId
  if (opts.suggestedFix !== undefined) item.suggestedFix = opts.suggestedFix
  return item
}

function pf(ctx: ValidationContext, key: string): unknown {
  return ctx.project.poolFields[key]
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  return false
}

// Every rule below checks real project/measurement/selection data. Rules that
// only ever emitted a hardcoded pass or fail (synthetic setback, depth-marker,
// spillover, heater-BTU, and the decorative "safety ✓" code pills) were
// removed: printing a green "GFCI ✓ / NEC 680.26 bonding ✓" on a
// contractor-facing packet while checking nothing is a liability, and an
// always-fail warning trains users to ignore the dock. Reinstate any of them
// only with a real check against geometry/selections.
/**
 * Slope a deck can be walked on.
 *
 * Two percent is the usual drainage fall; above five a paved surface is
 * uncomfortable and above eight it is a ramp with rules of its own. These are
 * warnings rather than errors because a designer may genuinely intend a terrace.
 */
const WALKABLE_SLOPE_PCT = 5
const STEEP_SLOPE_PCT = 15

/** Above this, moving the dirt is a line item nobody should discover late. */
const NOTABLE_EARTHWORK_YARDS = 50

/**
 * Whether this design says anything about the ground.
 *
 * A flat site is not a graded site that happens to be level: nobody entered an
 * elevation, so there is nothing to check and nothing worth reporting.
 */
function isGraded(ctx: { measurements: { cutYards: number; fillYards: number; maxSlopePct: number } }): boolean {
  const { cutYards, fillYards, maxSlopePct } = ctx.measurements
  return cutYards > 0 || fillYards > 0 || maxSlopePct > 0
}

export const ALL_RULES: ValidationRule[] = [
  // ────────────────── Site grading ──────────────────
  {
    id: 'grade.slope.walkable',
    level: 'warn',
    category: 'grade',
    passMessage: 'Site slope is within a walkable fall',
    appliesTo: isGraded,
    check(ctx) {
      const slope = ctx.measurements.maxSlopePct
      if (slope <= WALKABLE_SLOPE_PCT) return null
      const level = slope > STEEP_SLOPE_PCT ? 'error' : 'warn'
      return fail(
        'grade.slope.walkable',
        level,
        'grade',
        `The site falls at ${slope}% at its steepest`,
        {
          suggestedFix:
            slope > STEEP_SLOPE_PCT
              ? 'This needs terracing or a retaining wall, not a single graded pad'
              : 'Consider a step or a retaining wall rather than a continuous fall',
        },
      )
    },
  },
  {
    id: 'grade.earthwork.priced',
    level: 'warn',
    category: 'grade',
    passMessage: 'Earthwork is accounted for',
    appliesTo: isGraded,
    check(ctx) {
      const moved = ctx.measurements.cutYards + ctx.measurements.fillYards
      if (moved < NOTABLE_EARTHWORK_YARDS) return null
      // Not an error: the volume may well be priced under a lump sum. It is
      // worth saying out loud because discovering it on site is expensive.
      return fail(
        'grade.earthwork.priced',
        'warn',
        'grade',
        `${Math.round(moved)} cubic yards of earth is being moved`,
        {
          suggestedFix: 'Check the price book has an earthwork line, or the haulage is unbilled',
        },
      )
    },
  },
  {
    id: 'grade.fill.under.pool',
    level: 'warn',
    category: 'grade',
    passMessage: 'Pool is not sitting on deep fill',
    appliesTo: isGraded,
    check(ctx) {
      // A pool bearing on fill needs compaction or piers. Cheap to say now,
      // very expensive to find out after the shell is in.
      if (!ctx.measurements.hasPool) return null
      if (ctx.measurements.fillYards < NOTABLE_EARTHWORK_YARDS) return null
      return fail(
        'grade.fill.under.pool',
        'warn',
        'grade',
        'The design brings in a substantial amount of fill',
        { suggestedFix: 'Confirm bearing under the shell: compacted fill or piers' },
      )
    },
  },
  // ────────────────── Project-level ──────────────────
  {
    id: 'customer.name.required',
    level: 'error',
    category: 'project',
    passMessage: 'Customer name set',
    check(ctx) {
      return isBlank(ctx.project.customerName)
        ? fail('customer.name.required', 'error', 'project', 'Missing customer name', {
            field: 'customerName',
            suggestedFix: 'Add a customer name in project settings',
          })
        : null
    },
  },
  {
    id: 'customer.address.required',
    level: 'warn',
    category: 'project',
    passMessage: 'Job address set',
    check(ctx) {
      return isBlank(ctx.project.address)
        ? fail(
            'customer.address.required',
            'warn',
            'project',
            'Job address is recommended for export',
            {
              field: 'address',
              suggestedFix: 'Add the job site address',
            },
          )
        : null
    },
  },
  {
    id: 'proposal.expiration.set',
    level: 'warn',
    category: 'export',
    passMessage: 'Proposal expiration set',
    check(ctx) {
      return isBlank(ctx.project.proposalExpiresAt)
        ? fail(
            'proposal.expiration.set',
            'warn',
            'export',
            'Proposal expiration date not set',
            {
              field: 'proposalExpiresAt',
              suggestedFix: 'Set a proposal expiration date',
            },
          )
        : null
    },
  },

  // ────────────────── Pool ──────────────────
  {
    id: 'pool.area.required',
    level: 'error',
    category: 'pool',
    passMessage: 'Pool surface area present',
    check(ctx) {
      return ctx.measurements.poolSurfaceArea <= 0
        ? fail(
            'pool.area.required',
            'error',
            'pool',
            'Pool has no measured area — draw a pool shape',
            {
              targetId: ctx.targets?.pool,
              suggestedFix: 'Drop a pool stencil from the Stencils tab',
            },
          )
        : null
    },
  },
  {
    id: 'pool.depth.required',
    level: 'error',
    category: 'pool',
    passMessage: 'Pool depths set',
    check(ctx) {
      const shallow = pf(ctx, 'depthShallow')
      const deep = pf(ctx, 'depthDeep')
      if (isBlank(shallow) || isBlank(deep)) {
        return fail(
          'pool.depth.required',
          'error',
          'pool',
          'Set both shallow and deep end depths',
          {
            field: 'depthShallow',
            targetId: ctx.targets?.pool,
            suggestedFix: 'Enter shallow + deep depth in Geometry section',
          },
        )
      }
      return null
    },
  },
  {
    id: 'pool.interior.required',
    level: 'warn',
    category: 'pool',
    passMessage: 'Interior finish selected',
    check(ctx) {
      return isBlank(pf(ctx, 'interiorFinish'))
        ? fail(
            'pool.interior.required',
            'warn',
            'pool',
            'Select a pool interior finish',
            {
              field: 'interiorFinish',
              targetId: ctx.targets?.pool,
              suggestedFix: 'Set the interior finish in project settings',
            },
          )
        : null
    },
  },

  // ────────────────── Equipment ──────────────────
  {
    id: 'equipment.pump.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Equipment package selected',
    check(ctx) {
      return isBlank(pf(ctx, 'equipmentPackage'))
        ? fail('equipment.pump.required', 'warn', 'equipment', 'No equipment package selected', {
            field: 'equipmentPackage',
            suggestedFix: 'Pick an equipment package (includes the pump)',
          })
        : null
    },
  },
  {
    id: 'equipment.sanitation.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Sanitation selected',
    check(ctx) {
      // Satisfied by a sanitation package or by the salt-system selection.
      if (!isBlank(pf(ctx, 'sanitizationPackage')) || ctx.selections.saltSelected) return null
      return fail(
        'equipment.sanitation.required',
        'warn',
        'equipment',
        'No sanitation selection',
        {
          field: 'sanitizationPackage',
          suggestedFix: 'Pick chlorine, salt, or UV in project settings',
        },
      )
    },
  },
  {
    id: 'heater.fuel.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Heater specified',
    check(ctx) {
      if (!ctx.selections.heaterSelected) return null
      return isBlank(pf(ctx, 'heaterSelection'))
        ? fail(
            'heater.fuel.required',
            'warn',
            'equipment',
            'Heater included but model/fuel not specified',
            {
              field: 'heaterSelection',
              targetId: ctx.targets?.heater,
              suggestedFix: 'Set the heater model/fuel in project settings',
            },
          )
        : null
    },
  },
  {
    id: 'screen.specs.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Screen specs provided',
    check(ctx) {
      if (!ctx.selections.screenSelected) return null
      return isBlank(pf(ctx, 'screenOption'))
        ? fail(
            'screen.specs.required',
            'warn',
            'equipment',
            'Screen selected but no screen spec set',
            {
              field: 'screenOption',
              suggestedFix: 'Set the screen mesh + cage spec in project settings',
            },
          )
        : null
    },
  },

  // ────────────────── Deck ──────────────────
  {
    id: 'deck.material.required',
    level: 'warn',
    category: 'deck',
    passMessage: 'Deck material selected',
    check(ctx) {
      if (!ctx.hasDeck) return null
      return isBlank(pf(ctx, 'deckMaterial'))
        ? fail(
            'deck.material.required',
            'warn',
            'deck',
            'Deck drawn but no deck material selected',
            {
              field: 'deckMaterial',
              suggestedFix: 'Pick a deck material in project settings',
            },
          )
        : null
    },
  },

  // ────────────────── Export ──────────────────
  {
    id: 'quote.total.zero',
    level: 'warn',
    category: 'export',
    passMessage: 'Quote has billable area',
    check(ctx) {
      return ctx.measurements.poolSurfaceArea <= 0
        ? fail(
            'quote.total.zero',
            'warn',
            'export',
            'Quote total will be zero with no pool area',
            {
              suggestedFix: 'Add a pool shape so pricing has surface area to bill',
            },
          )
        : null
    },
  },
]
