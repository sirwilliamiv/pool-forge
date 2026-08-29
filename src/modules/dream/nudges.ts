// What the studio says back while somebody is building.
//
// This is the homeowner-facing counterpart to `modules/validation/`, and it is
// separate from it on purpose. The validation dock exists to stop a builder
// sending a proposal with a mistake in it: its rules are about code, slope and
// missing contract fields, and its voice is a checklist. Nothing here can fail
// a proposal, because there is no proposal. These are the things a good builder
// says out loud on a first visit, in the order they would say them.
//
// Two rules govern what may be added to this list.
//
// It must be true of the design in front of the visitor, checked against the
// config or the measurements. A generic tip that fires on every pool is an
// advert wearing a hint's clothing, and after the second visit nobody reads any
// of them.
//
// It must be something the visitor can act on with a control that is on the
// screen. A nudge about soil is interesting and useless; a nudge that says the
// deck is tight is one click from being fixed, and clicking it is the game.

import { deckSizeById, depthById, shapeById, sizeById } from './catalog'
import type { DreamConfig } from './config'
import { isAtSpreadCeiling, type BudgetVerdict } from './spread'

export type NudgeTone =
  /** Something is missing or mismatched, and the fix is on screen. */
  | 'fix'
  /** Worth knowing before they fall in love with it. */
  | 'note'
  /** They have made a good call. Said sparingly or it stops meaning anything. */
  | 'good'

export interface Nudge {
  readonly id: string
  readonly tone: NudgeTone
  readonly text: string
  /**
   * The config field this is about, so the studio can point at the control.
   *
   * Same idea as `ValidationItem.targetId`: a message you cannot act on from
   * where you are standing is a message that gets ignored.
   */
  readonly field: keyof DreamConfig | null
}

function nudge(id: string, tone: NudgeTone, text: string, field: keyof DreamConfig | null): Nudge {
  return { id, tone, text, field }
}

export interface NudgeContext {
  readonly config: DreamConfig
  readonly poolAreaSqft: number
  readonly deckAreaSqft: number
  readonly verdict: BudgetVerdict
}

/**
 * Everything worth saying about this backyard, most useful first.
 *
 * Capped by the caller rather than here, because how many fit is a question
 * about the screen and this file should not have an opinion about the screen.
 */
export function dreamNudges(ctx: NudgeContext): Nudge[] {
  const { config, poolAreaSqft, deckAreaSqft, verdict } = ctx
  const out: Nudge[] = []
  const size = sizeById(config.size)
  const depth = depthById(config.depth)
  const deck = deckSizeById(config.deckSize)

  // Money first. Somebody who is over budget is not reading anything else.
  if (verdict?.kind === 'over') {
    out.push(
      nudge(
        'over-budget',
        'fix',
        `This is past the number you gave by about ${formatShortMoney(verdict.ceiling * (verdict.usedFraction - 1))}. The screen enclosure, the spa and the deck material are the three biggest levers.`,
        null,
      ),
    )
  } else if (verdict?.kind === 'tight') {
    out.push(
      nudge(
        'tight-budget',
        'note',
        'The middle of this range fits your budget but the top of it does not. Worth leaving something back for the yard afterwards.',
        null,
      ),
    )
  }

  // A pool you cannot walk round is the single most common regret, and it is
  // one click from fixed.
  if (deckAreaSqft < poolAreaSqft * 0.7) {
    out.push(
      nudge(
        'thin-deck',
        'fix',
        'That is a tight walkway for a pool this size. Two loungers and a table need roughly as much paving as the pool has water.',
        'deckSize',
      ),
    )
  }

  // Diving depth is bought far more often than it is used, and it is expensive
  // twice over: more water to build and more water to heat.
  if (config.depth === 'diving' && !config.spa) {
    out.push(
      nudge(
        'diving-cost',
        'note',
        'Diving depth adds real money in excavation and in every heating bill after. Most families swim in the shallow two thirds.',
        'depth',
      ),
    )
  }

  // A heated pool is used most of the year; an unheated one is used for about
  // three months. This is the highest-value thing anybody can be told here.
  if (!config.heater) {
    out.push(
      nudge(
        'no-heater',
        'note',
        'Without a heater this is a summer pool. A heater is the cheapest thing on this page that changes how many months you swim.',
        'heater',
      ),
    )
  }

  // Salt is a running-cost decision, not a build-cost one, and the build-cost
  // page is where people get it wrong.
  if (config.heater && !config.saltwater) {
    out.push(
      nudge(
        'salt-pairing',
        'note',
        'A saltwater system costs less to run than chlorine and is gentler on skin and swimwear. It pairs well with a heated pool you use often.',
        'saltwater',
      ),
    )
  }

  // A cage over a small pool costs more than the pool.
  if (config.screenEnclosure && poolAreaSqft < 300) {
    out.push(
      nudge(
        'cage-vs-pool',
        'fix',
        'On a pool this size the screen enclosure is the single largest line on the job. Worth pricing the pool without it first.',
        'screenEnclosure',
      ),
    )
  }

  // The shape people choose for looks, on a size where it costs them the swim.
  if (shapeById(config.shape).outline === 'kidney' && size.lengthFt <= 24) {
    out.push(
      nudge(
        'kidney-small',
        'note',
        'A kidney on a pool this short leaves very little straight water. A rectangle of the same size swims noticeably bigger.',
        'shape',
      ),
    )
  }

  // Stone that stays cool is the one upgrade people notice with their feet, and
  // the one they most regret skipping. Only said where it is relevant.
  if (config.deckMaterial === 'concrete' && deck.areaFactor >= 1.5) {
    out.push(
      nudge(
        'hot-deck',
        'note',
        'A deck this big in plain concrete gets hot in full sun. Travertine is the upgrade people say they notice most.',
        'deckMaterial',
      ),
    )
  }

  // Lighting is cheap and is what makes a pool a place in the evening.
  if (config.extraLights === 0 && (config.spa || config.waterFeatures > 0)) {
    out.push(
      nudge(
        'unlit-features',
        'note',
        'You have features that only show up after dark. A couple of extra lights is the cheapest thing on this page.',
        'extraLights',
      ),
    )
  }

  // Said once, and only when it is genuinely a good pairing rather than the
  // most expensive option.
  if (config.depth === 'wading' && depth.deepFt <= 4 && config.spa) {
    out.push(
      nudge(
        'shallow-and-spa',
        'good',
        'A shallow pool with a spa is a good combination for a family with young children: safe water to play in and somewhere warm for the adults.',
        null,
      ),
    )
  }

  // The honest end of the road. When the range has widened as far as it is
  // allowed to, the page should stop pretending it can narrow it.
  if (isAtSpreadCeiling(config)) {
    out.push(
      nudge(
        'past-guessing',
        'note',
        'A build with this much in it depends more on your site than on anything you can pick here. This is the point where a builder standing in your yard tells you more than we can.',
        null,
      ),
    )
  }

  return out
}

/** "$12k". Rough on purpose: this is a nudge, not a line item. */
function formatShortMoney(value: number): string {
  const rounded = Math.max(0, Math.round(value / 1_000))
  return `$${rounded}k`
}
