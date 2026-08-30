// What Marco is allowed to point at.
//
// Chrome only: toolbars, panels, tabs, menus. Never anything in the drawing.
//
// That is not a simplification, it is the only thing that can work. The drawing
// is WebGL, so a pool is not an element and has no position a highlight could
// sit on: pointing at one would mean projecting world coordinates every frame
// and keeping a ring glued to a moving camera. Chrome is real DOM with a stable
// box, and it is also the half people actually get lost in. Nobody cannot find
// the pool.
//
// Targets are resolved by accessible name rather than by a `data-guide`
// attribute sprinkled through the components. Every control here already
// carries an aria-label or a title because it had to for screen readers, so
// resolution rides on something that is maintained for its own reasons and
// cannot quietly rot: a button that loses its label breaks accessibility long
// before it breaks the guide.

export type GuideScreen = 'editor' | 'dashboard' | 'project' | 'priceBook' | 'settings'

export interface GuideTarget {
  /** What the agent asks for. */
  id: string
  /** The accessible name, or the visible text, to find it by. */
  name: string
  screen: GuideScreen
  /** Other things a person might call it, matched case-insensitively. */
  aliases?: string[]
  /** One sentence, in a builder's words, for the agent to say while pointing. */
  explain: string
  /**
   * CSS selector that finds it directly. For controls whose accessible name
   * lives on something the candidate query cannot see, like a role=group.
   */
  selector?: string
  /** CSS selector for the container to search in, when the name repeats on the page. */
  within?: string
  /**
   * Visible labels to click, in order, to make this control exist. A tab that
   * has to be opened first. Consumed by guide.point's reveal step.
   */
  openPath?: string[]
}

/**
 * The pointable chrome, per screen.
 *
 * Deliberately not exhaustive. A guide that can point at ninety things is a
 * guide that points at the wrong one, and every entry here is a claim that
 * somebody might reasonably ask where it is.
 */
export const GUIDE_TARGETS: readonly GuideTarget[] = [
  // ---- editor: drawing -------------------------------------------------
  {
    id: 'tool.line',
    name: 'Line',
    screen: 'editor',
    aliases: ['draw a line', 'straight line', 'pen'],
    explain: 'Click each corner to draw a straight path. Shift locks it square.',
  },
  {
    id: 'tool.curve',
    name: 'Curve',
    screen: 'editor',
    aliases: ['arc', 'curved line'],
    explain: 'Three clicks: where the arc starts, a point it passes through, and where it ends.',
  },
  {
    id: 'tool.freehand',
    name: 'Freehand',
    screen: 'editor',
    aliases: ['sketch', 'draw by hand'],
    explain: 'Drag to draw. On release it is simplified and snapped to the grid.',
  },
  {
    id: 'grid.size',
    name: 'Grid size',
    screen: 'editor',
    aliases: ['grid', 'snap size', 'how big the grid is'],
    explain: 'How fine the grid is, from three inches to five feet.',
  },
  {
    id: 'tool.select',
    name: 'Move',
    screen: 'editor',
    aliases: ['select', 'pointer', 'arrow'],
    explain: 'Select and drag objects. Everything comes back to this one.',
  },
  {
    id: 'tool.measure',
    name: 'Measure',
    screen: 'editor',
    aliases: ['tape', 'dimension', 'how long'],
    explain: 'Two clicks gives you the distance between them.',
  },
  {
    id: 'tool.material-brush',
    name: 'Material brush',
    screen: 'editor',
    aliases: ['finish', 'paint', 'material'],
    explain: 'Paint a finish onto a surface you have already drawn.',
  },
  {
    id: 'tool.comment',
    name: 'Comment',
    screen: 'editor',
    aliases: ['note on the drawing', 'pin a note'],
    explain: 'Drop a note on the drawing for whoever opens it next.',
  },

  // ---- editor: panels and views ---------------------------------------
  {
    id: 'panel.stencils',
    name: 'Stencils',
    screen: 'editor',
    aliases: ['shapes', 'catalogue', 'objects', 'palette'],
    explain: 'Every pool shape, step, feature and deck you can place.',
  },
  {
    id: 'panel.layers',
    name: 'Layers',
    screen: 'editor',
    aliases: ['what is on the drawing', 'object list'],
    explain: 'Everything on this drawing, and what you can hide or lock.',
  },
  {
    id: 'panel.materials',
    name: 'Materials',
    screen: 'editor',
    aliases: ['finishes', 'tile', 'coping options'],
    explain: 'The finishes your price book carries.',
  },
  {
    id: 'panel.grade',
    name: 'Grade',
    screen: 'editor',
    aliases: ['elevation', 'cut and fill', 'slope'],
    explain: 'Shots and elevations, which is where cut and fill comes from.',
  },
  {
    id: 'view.plan',
    name: 'Plan',
    screen: 'editor',
    aliases: ['2d', 'top down', 'from above'],
    explain: 'The 2D view, straight down. Drawing tools switch you here.',
  },
  {
    id: 'view.3d',
    name: '3D',
    screen: 'editor',
    aliases: ['three d', 'perspective'],
    explain: 'The perspective view, for showing a customer.',
  },
  {
    id: 'view.fit',
    name: 'Fit everything in view',
    screen: 'editor',
    aliases: ['fit', 'zoom to fit', 'i cannot see anything'],
    explain: 'Brings the whole drawing back into frame.',
  },
  {
    id: 'view.cube',
    name: 'View cube',
    screen: 'editor',
    aliases: ['camera angles', 'top left right front'],
    selector: '[aria-label="View cube"]',
    explain: 'Jump the camera to a named angle.',
  },
  {
    id: 'palette.commands',
    name: 'Open the command palette',
    screen: 'editor',
    aliases: ['commands', 'search actions', 'what can i do'],
    explain: 'Everything the app can do, searchable.',
  },
  {
    id: 'export.document',
    name: 'Export document',
    screen: 'editor',
    aliases: ['proposal', 'pdf', 'print', 'construction set'],
    explain: 'Produces the proposal and the construction set from this drawing.',
  },
  {
    id: 'edit.undo',
    name: 'Undo',
    screen: 'editor',
    aliases: ['take that back', 'go back'],
    explain: 'Takes back the last change.',
  },

  // ---- dashboard --------------------------------------------------------
  {
    id: 'project.new',
    name: 'New project',
    screen: 'dashboard',
    aliases: ['start a job', 'add a project'],
    explain: 'Starts a new job.',
  },
  {
    id: 'nav.priceBook',
    name: 'Price book',
    screen: 'dashboard',
    aliases: ['pricing', 'my prices', 'rates'],
    explain: 'Your own prices, which is what every quote is built from.',
  },
  {
    id: 'nav.team',
    name: 'Team',
    screen: 'dashboard',
    aliases: ['invite somebody', 'staff', 'users'],
    explain: 'Who is on your team, and how to invite somebody.',
  },
  {
    id: 'nav.company',
    name: 'Company',
    screen: 'dashboard',
    aliases: ['business details', 'licence', 'logo'],
    explain: 'The details that print on every proposal and permit sheet.',
  },
]

/** Everything pointable on one screen. */
export function targetsFor(screen: GuideScreen): readonly GuideTarget[] {
  return GUIDE_TARGETS.filter(target => target.screen === screen)
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Find the targets a phrase is asking about.
 *
 * Returns several on purpose. "Where are the drawing tools" should light up all
 * three, which is the whole reason Marco can point at more than one thing.
 */
export function matchTargets(phrase: string, screen: GuideScreen): GuideTarget[] {
  const want = normalise(phrase)
  if (!want) return []
  return targetsFor(screen).filter(target => {
    if (normalise(target.id) === want) return true
    const names = [target.name, ...(target.aliases ?? [])].map(normalise)
    return names.some(name => name === want || want.includes(name) || name.includes(want))
  })
}

/** Exactly the target with this id, on any screen. */
export function targetById(id: string): GuideTarget | null {
  return GUIDE_TARGETS.find(target => target.id === id) ?? null
}
