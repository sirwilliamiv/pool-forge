import type { ValidationContext, ValidationItem, ValidationRule } from './types'

function fail(
  id: string,
  level: 'warn' | 'error',
  category: ValidationItem['category'],
  message: string,
  field?: string,
): ValidationItem {
  const item: ValidationItem = { id, level, category, message }
  if (field !== undefined) item.field = field
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
  {
    id: 'customer.name.required',
    level: 'error',
    category: 'project',
    passMessage: 'Customer name set',
    check(ctx) {
      return isBlank(ctx.project.customerName)
        ? fail(
            'customer.name.required',
            'error',
            'project',
            'Missing customer name',
            'customerName',
          )
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
            'address',
          )
        : null
    },
  },
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
          'depthShallow',
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
            'interior',
          )
        : null
    },
  },
  {
    id: 'equipment.pump.required',
    level: 'warn',
    category: 'equipment',
    passMessage: 'Pump selected',
    check(ctx) {
      return isBlank(pf(ctx, 'pump'))
        ? fail(
            'equipment.pump.required',
            'warn',
            'equipment',
            'No pump selection',
            'pump',
          )
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
            'sanitation',
          )
        : null
    },
  },
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
            'deckMaterial',
          )
        : null
    },
  },
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
            'screenSpec',
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
            'heaterFuel',
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
            'proposalExpiresAt',
          )
        : null
    },
  },
]
