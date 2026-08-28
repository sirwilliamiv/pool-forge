// Onboarding: making a brand new organisation usable on the day it is created.
//
// The one call every organisation-creation path should make is
// `seedNewOrganization(orgId, tx?)`. Everything else here is read-only or UI
// support.

export {
  seedNewOrganization,
  ensureStarterPriceBook,
  type OnboardingDb,
  type SeedOrganizationResult,
  type StarterPriceBookResult,
} from './seed-organization'

export {
  STARTER_PRICE_BOOK_NAME,
  STARTER_PRICE_BOOK_VERSION,
  STARTER_PRICE_LINES,
  PLACEHOLDER_PRICE_NOTICE,
  unchangedStarterLines,
  type StarterPriceLine,
  type StoredPriceLine,
} from './starter-price-book'

export {
  drawableCategories,
  stencilsPerCategory,
  priceBookCoverage,
  coverageGaps,
  BILLABLE_UNITS,
  type CoverageItem,
  type CoverageRow,
  type CoverageStatus,
} from './coverage'

export {
  FIRST_RUN_SETTING_KEY,
  buildFirstRunSteps,
  loadFirstRun,
  loadFirstRunFacts,
  isFirstRunDismissed,
  dismissFirstRun,
  type FirstRunFacts,
  type FirstRunState,
  type FirstRunStep,
  type FirstRunStepId,
} from './first-run'
