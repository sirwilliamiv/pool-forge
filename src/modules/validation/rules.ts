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

export const ALL_RULES: ValidationRule[] = [
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
      return isBlank(pf(ctx, 'interior'))
        ? fail(
            'pool.interior.required',
            'warn',
            'pool',
            'Select a pool interior finish',
            {
              field: 'interior',
              targetId: ctx.targets?.pool,
              suggestedFix: 'Pick an interior finish in the Materials tab',
            },
          )
        : null
    },
  },

  // ────────────────── Setback (synthetic, demo-friendly) ──────────────────
  {
    id: 'pool.setback.rear',
    level: 'warn',
    category: 'pool',
    passMessage: 'Pool clears rear setback',
    check(ctx) {
      // Synthetic: warn if the seeded project's pool sits within 7'6" of rear setback.
      // Real implementation uses computed setback distance once we have property lines.
      if (ctx.measurements.poolSurfaceArea <= 0) return null
      return fail(
        'pool.setback.rear',
        'warn',
        'pool',
        'Pool within 5\'2" of rear property setback (req. 7\'6")',
        {
          targetId: ctx.targets?.pool,
          suggestedFix: 'Move pool 2\'4" toward house',
        },
      )
    },
  },
  {
    id: 'pool.depth.marker.placed',
    level: 'warn',
    category: 'pool',
    passMessage: 'Deep-end depth marker placed',
    check(ctx) {
      if (ctx.measurements.poolSurfaceArea <= 0) return null
      // Synthetic: assume marker missing for demo. Real impl scans for depth-marker stencils.
      return fail(
        'pool.depth.marker.placed',
        'warn',
        'pool',
        'Deep-end depth marker not placed',
        {
          targetId: ctx.targets?.pool,
          suggestedFix: 'Drop a depth-marker stencil at the deep end',
        },
      )
    },
  },

  // ────────────────── Spillover / spa ──────────────────
  {
    id: 'spillover.elevation',
    level: 'error',
    category: 'pool',
    passMessage: 'Spillover elevation matches spa skirt',
    check(ctx) {
      // Synthetic: fires when a spa is present in the design.
      if (!ctx.targets?.spa) return null
      return fail(
        'spillover.elevation',
        'error',
        'pool',
        'Spillover elevation 1.25" below spa skirt',
        {
          targetId: ctx.targets.spillover ?? ctx.targets.spa,
          suggestedFix: 'Raise spillover by 1.25"',
        },
      )
    },
  },

  // ────────────────── Equipment ──────────────────
  {
    id: 'equipment.heater.btu',
    level: 'error',
    category: 'equipment',
    passMessage: 'Heater BTU sized for pool volume',
    check(ctx) {
      // Synthetic: any selected heater on a 24k+ gal pool is "undersized" for demo.
      if (!ctx.selections.heaterSelected) return null
      const gallons = ctx.measurements.poolGallons
      if (gallons < 20000) return null
      return fail(
        'equipment.heater.btu',
        'error',
        'equipment',
        `Heater BTU undersized for ${Math.round(gallons).toLocaleString()} gal at 88°F`,
        {
          field: 'heaterBtu',
          targetId: ctx.targets?.heater,
          suggestedFix: 'Upgrade to 500k BTU (+$1,250)',
        },
      )
    },
  },
  {
    id: 'equipment.pump.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Pump selected',
    check(ctx) {
      return isBlank(pf(ctx, 'pump'))
        ? fail('equipment.pump.required', 'warn', 'equipment', 'No pump selection', {
            field: 'pump',
            suggestedFix: 'Pick a variable-speed pump in Equipment',
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
      return isBlank(pf(ctx, 'sanitation'))
        ? fail(
            'equipment.sanitation.required',
            'warn',
            'equipment',
            'No sanitation selection',
            {
              field: 'sanitation',
              suggestedFix: 'Pick chlorine, salt, or UV in Equipment',
            },
          )
        : null
    },
  },
  {
    id: 'heater.fuel.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Heater fuel set',
    check(ctx) {
      if (!ctx.selections.heaterSelected) return null
      return isBlank(pf(ctx, 'heaterFuel'))
        ? fail(
            'heater.fuel.required',
            'warn',
            'equipment',
            'Heater selected but fuel type not set (gas/electric)',
            {
              field: 'heaterFuel',
              targetId: ctx.targets?.heater,
              suggestedFix: 'Set heater fuel type in Equipment',
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
      return isBlank(pf(ctx, 'screenSpec'))
        ? fail(
            'screen.specs.required',
            'warn',
            'equipment',
            'Screen selected but no screen spec set',
            {
              field: 'screenSpec',
              suggestedFix: 'Set screen mesh + cage spec',
            },
          )
        : null
    },
  },

  // ────────────────── Always-pass safety / code rules (demo "ok" pills) ──────────────────
  {
    id: 'safety.drains.placed',
    level: 'warn',
    category: 'pool',
    passMessage: 'Main drains placed (anti-entrapment compliant)',
    check(_ctx) {
      // Stub: future impl scans for drain stencils. For demo, always passes.
      return null
    },
  },
  {
    id: 'safety.perimeter.alarm',
    level: 'warn',
    category: 'pool',
    passMessage: "Perimeter safety alarm spec'd",
    check(_ctx) {
      return null
    },
  },
  {
    id: 'safety.ground.bonding',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Equipment bonding present (NEC 680.26)',
    check(_ctx) {
      return null
    },
  },
  {
    id: 'safety.gfci',
    level: 'warn',
    category: 'equipment',
    passMessage: 'GFCI on all pool circuits',
    check(_ctx) {
      return null
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
              suggestedFix: 'Pick a deck material in the Materials tab',
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
