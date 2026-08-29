import { ALL_RULES } from './rules'
import type { ValidationContext, ValidationItem, ValidationReport } from './types'

const LEVEL_ORDER: Record<ValidationItem['level'], number> = {
  error: 0,
  warn: 1,
  pass: 2,
}

export function runValidation(ctx: ValidationContext): ValidationReport {
  const items: ValidationItem[] = []

  for (const rule of ALL_RULES) {
    // A rule with nothing to say is left out entirely rather than passed. Passing
    // it would put a line about site grading on every flat project.
    if (rule.appliesTo && !rule.appliesTo(ctx)) continue

    const failure = rule.check(ctx)
    if (failure) {
      items.push(failure)
    } else {
      items.push({
        id: rule.id,
        level: 'pass',
        category: rule.category,
        message: rule.passMessage,
      })
    }
  }

  items.sort((a, b) => {
    const lvl = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    if (lvl !== 0) return lvl
    return a.category.localeCompare(b.category)
  })

  const counts = { pass: 0, warn: 0, error: 0 }
  for (const item of items) counts[item.level] += 1

  return { items, counts }
}

export { ALL_RULES }
