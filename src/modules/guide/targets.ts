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

export type GuideScreen =
  | 'editor'
  | 'dashboard'
  | 'project'
  | 'priceBook'
  | 'settings'
  | 'import'
  | 'document'

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

  // ---- editor: additions -----------------------------------------------
  {
    id: 'view.section',
    name: 'Section',
    screen: 'editor',
    aliases: ['cut view', 'depth view'],
    explain: 'A vertical slice through the pool, for depths.',
  },
  {
    id: 'tool.deck',
    name: 'Deck',
    screen: 'editor',
    aliases: ['patio', 'concrete'],
    explain: 'Draw decking around the pool.',
  },
  {
    id: 'tool.steps',
    name: 'Steps & shelves',
    screen: 'editor',
    aliases: ['steps', 'tanning ledge', 'baja shelf'],
    explain: 'Steps, benches and tanning ledges.',
  },
  {
    id: 'tool.water',
    name: 'Water feature',
    screen: 'editor',
    aliases: ['waterfall', 'bubbler', 'fountain'],
    explain: 'Waterfalls, bubblers and scuppers.',
  },
  {
    id: 'tool.lights',
    name: 'Lights',
    screen: 'editor',
    aliases: ['led', 'lighting'],
    explain: 'Place pool and landscape lights.',
  },
  {
    id: 'tool.annotation',
    name: 'Annotation',
    screen: 'editor',
    aliases: ['text', 'label the drawing'],
    explain: 'Put text on the drawing itself.',
  },
  {
    id: 'panel.site',
    name: 'Site',
    screen: 'editor',
    within: '[data-guide-scope="left-panel"]',
    aliases: ['property line', 'setbacks', 'lot'],
    explain: 'Property line, structures and setback limits.',
  },
  {
    // Three of the four render states (no quote loaded, nothing drawn, no
    // active price book) show only the Shell wrapper with no toggle button
    // inside it, so a name match against "Quote" only ever resolved in the
    // fully priced state. The Shell wrapper itself carries the scope
    // attribute in all four states, so a selector on the scope attribute
    // resolves everywhere: the ring lands on the whole dock instead of just
    // the toggle button, which is exactly what you want to point at when
    // there is nothing to expand yet.
    id: 'quote.dock',
    name: 'Quote',
    screen: 'editor',
    selector: '[data-guide-scope="quote-dock"]',
    aliases: ['price', 'total', 'how much'],
    explain: 'The live price of what is drawn, with the breakdown.',
  },
  {
    // The collapsed button's aria-label carries live error/warning/pass
    // counts ("Checklist: 2 errors, 1 warning, 4 passed"), which breaks the
    // prefix match against a plain "Checklist" name. The selector reaches
    // the button by the stable part of that label instead of relying on an
    // exact accessible-name match.
    id: 'validation.dock',
    name: 'Checklist',
    screen: 'editor',
    selector: '[data-guide-scope="validation-dock"] [aria-label^="Checklist"]',
    aliases: ['errors', 'warnings', 'rules'],
    explain: 'Everything the rules found, and a click jumps to the shape.',
  },
  {
    id: 'editor.notes',
    name: 'Notes',
    screen: 'editor',
    aliases: ['comments', 'drawing notes'],
    explain: 'Notes left on this drawing, open and resolved.',
  },
  {
    id: 'editor.templates',
    name: 'Scene templates',
    screen: 'editor',
    aliases: ['templates', 'start from a template'],
    explain: 'Save this scene as a template, or apply one.',
  },
  {
    id: 'edit.redo',
    name: 'Redo',
    screen: 'editor',
    aliases: ['put it back'],
    explain: 'Puts back what undo took.',
  },
  {
    id: 'scene.sun',
    name: 'Time of day',
    screen: 'editor',
    selector: '[aria-label="Time of day"]',
    aliases: ['sun', 'shadows', 'sun study'],
    explain: 'Drag between sunrise and sunset to see shadows move.',
  },

  // ---- project overview -------------------------------------------------
  {
    id: 'project.openEditor',
    name: 'Open editor',
    screen: 'project',
    aliases: ['open the drawing', 'design'],
    explain: 'Opens the drawing for this job.',
  },
  {
    id: 'project.import',
    name: 'Import from image',
    screen: 'project',
    aliases: ['photo', 'scan a plan'],
    explain: 'Turns a photo or an old plan into a measured design.',
  },
  {
    id: 'project.duplicate',
    name: 'Duplicate',
    screen: 'project',
    explain: 'Copies this job, drawing and all.',
  },
  {
    id: 'project.archive',
    name: 'Archive',
    screen: 'project',
    explain: 'Puts this job away without deleting it.',
  },
  {
    id: 'doc.proposal',
    name: 'Customer proposal',
    screen: 'project',
    aliases: ['proposal', 'quote document'],
    explain: 'The document you send the customer.',
  },
  {
    id: 'doc.construction',
    name: 'Construction packet',
    screen: 'project',
    aliases: ['build docs', '11x17'],
    explain: 'The dimensioned set the crew builds from.',
  },
  {
    id: 'doc.sitePlan',
    name: 'Site plan',
    screen: 'project',
    aliases: ['permit drawing'],
    explain: 'The plan a county wants for permitting.',
  },
  {
    id: 'doc.screenQuote',
    name: 'Screen enclosure RFQ',
    screen: 'project',
    aliases: ['screen quote', 'enclosure'],
    explain: 'The request you send a screen subcontractor.',
  },
  {
    id: 'share.create',
    name: 'Create link',
    screen: 'project',
    within: '[data-guide-scope="share-proposal"]',
    aliases: ['share', 'send to the customer'],
    explain: 'Makes a link the customer can open and accept.',
  },
  {
    id: 'version.saveCurrent',
    name: 'Save current drawing',
    screen: 'project',
    within: '[data-guide-scope="versions"]',
    aliases: ['save a version', 'design options'],
    explain: 'Keeps this design as an option you can come back to.',
  },
  {
    id: 'lineItem.add',
    name: 'Add',
    screen: 'project',
    within: '[data-guide-scope="line-items"]',
    aliases: ['add a line item', 'add a charge'],
    explain: 'Adds a charge to this job that is not drawn.',
  },

  // ---- import -------------------------------------------------------------
  {
    // The brief's page inventory called this "Upload images". The component
    // (ImportEmptyState.tsx) renders "Choose images" on the button; the text
    // "Upload" only appears in body copy and the icon.
    id: 'import.upload',
    name: 'Choose images',
    screen: 'import',
    aliases: ['add photos', 'upload', 'upload images'],
    explain: 'Add the photos or drawings to work from.',
  },
  {
    // The brief called this "Start calibration". CalibrationPanel.tsx renders
    // "Calibrate" when no scale exists yet, and "Recalibrate" once one does;
    // "Calibrate" is the one that matches the initial, two-point flow this
    // target explains.
    id: 'import.calibrate',
    name: 'Calibrate',
    screen: 'import',
    aliases: ['set the scale', 'scale', 'start calibration', 'recalibrate'],
    explain: 'Click two points and give the real distance, so pixels become feet.',
  },
  {
    // ApplyBar.tsx renders "Apply to project", not "Apply to the project".
    id: 'import.apply',
    name: 'Apply to project',
    screen: 'import',
    aliases: ['use this', 'finish the import'],
    explain: 'Turns the reviewed extraction into the actual design.',
  },
  {
    id: 'import.discard',
    name: 'Discard import',
    screen: 'import',
    aliases: ['throw it away', 'start over'],
    explain: 'Drops this import session without touching the project.',
  },

  // ---- documents ----------------------------------------------------------
  {
    id: 'doc.print',
    name: 'Print / Save as PDF',
    screen: 'document',
    aliases: ['print', 'pdf', 'save as pdf'],
    explain: 'Prints, or saves a PDF, from the browser.',
  },
  {
    // The proposal document renders this link as "← Back to project" (a
    // leading arrow character), which fails the prefix match against a plain
    // "Back to project" name. The selector finds it by the stable part of its
    // href instead.
    id: 'doc.back',
    name: 'Back to project',
    screen: 'document',
    selector: 'a[href^="/projects/"]',
    aliases: ['go back'],
    explain: 'Back to the job this document belongs to.',
  },

  // ---- price book ---------------------------------------------------------
  {
    id: 'pricebook.add',
    name: 'Add item',
    screen: 'priceBook',
    aliases: ['new price', 'add a price'],
    explain: 'A new line in your price book.',
  },
  {
    id: 'pricebook.import',
    name: 'Import XLSX',
    screen: 'priceBook',
    aliases: ['spreadsheet', 'excel', 'upload prices'],
    explain: 'Bring prices in from a spreadsheet.',
  },

  // ---- settings -----------------------------------------------------------
  {
    // The brief called this "Invite somebody", which is only the CardTitle
    // heading above the form (a div, never a guide candidate). The submit
    // button that actually mints the invite reads "Send invite".
    id: 'team.invite',
    name: 'Send invite',
    screen: 'settings',
    aliases: ['add a user', 'invite', 'invite somebody'],
    explain: 'Mints an invite link you hand to a teammate.',
  },
  {
    id: 'intake.create',
    name: 'Create link',
    screen: 'settings',
    within: '[data-guide-scope="intake-links"]',
    aliases: ['upload link', 'customer uploads'],
    explain: 'A link homeowners use to send you photos.',
  },
  {
    id: 'company.save',
    name: 'Save',
    screen: 'settings',
    aliases: ['save company settings'],
    explain: 'Saves the details that print on every proposal.',
  },
  {
    id: 'voice.confirmToggle',
    name: 'Ask before voice removes anything',
    screen: 'settings',
    selector: 'input[type="checkbox"]',
    aliases: ['confirmation', 'voice safety'],
    explain: 'When on, I always ask before I remove anything.',
  },

  // ---- dashboard: additions ----------------------------------------------
  {
    id: 'nav.uploads',
    name: 'Customer uploads',
    screen: 'dashboard',
    aliases: ['intake', 'homeowner photos'],
    explain: 'Links homeowners use to send you photos, and what came in.',
  },
  {
    id: 'nav.docs',
    name: 'Docs',
    screen: 'dashboard',
    aliases: ['help', 'reference'],
    explain: 'The tool and command reference.',
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
