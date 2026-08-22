# Pool Forge Command Reference

Auto-generated from `src/modules/commands/categories/*`. Run `pnpm tsx scripts/gen-commands.ts` to regenerate. Total commands: **70**.

## Project

### `create.project` — Create project

Create a new pool design project for a customer.

**Voice examples:**
- "Create a new project for the Smith family."
- "Start a new pool project named Backyard Build."

### `open.project` — Open project

Open an existing project by id.

**Voice examples:**
- "Open the Smith project."
- "Open project 12345."

### `save.project` — Save project

Persist the current drawing, pool fields, and notes.

**Voice examples:**
- "Save the project."
- "Save my work."

## Canvas

### `camera.frame.selection` — Frame selection

Frame the current selection in the viewport.

**Voice examples:**
- "Frame the selection."
- "Zoom to selection."

### `camera.set.view` — Snap camera to view

Snap the camera to a canonical view (top, front, left, right, iso).

**Voice examples:**
- "Show top view."
- "Iso view."

### `canvas.fit` — Fit to page

Fit all drawing content to the visible canvas.

**Voice examples:**
- "Fit to page."
- "Show everything."

### `canvas.pan` — Pan canvas

Pan the canvas viewport by a relative offset.

**Voice examples:**
- "Pan to the right."
- "Move the view down."

### `canvas.zoom.in` — Zoom in

Increase the canvas zoom level.

**Voice examples:**
- "Zoom in."
- "Zoom in a little more."

### `canvas.zoom.out` — Zoom out

Decrease the canvas zoom level.

**Voice examples:**
- "Zoom out."
- "Zoom out a bit."

### `mode.set.presentation` — Set presentation mode

Switch the presentation mode (plan, design, build, customer).

**Voice examples:**
- "Switch to build mode."
- "Show me the customer view."

### `scene.describe` — Describe what is on the canvas

Read back everything currently on the canvas: each object with its id, name, kind, position and size in inches, plus which objects are selected. Call this before moving, resizing, deleting or positioning anything relative to something else. Every other command needs an id, and this is the only way to learn one.

**Voice examples:**
- "What is on the canvas?"
- "What have we got so far?"
- "Where is the pool?"
- "How big is the deck?"

### `selection.set` — Set selection

Replace the current selection with the given shape ids.

**Voice examples:**
- "Select the pool."
- "Clear my selection."

### `tool.activate` — Activate tool

Set the active editor tool by id (matches Toolbar IDs / hotkeys).

**Voice examples:**
- "Pick the move tool."
- "Switch to the measure tool."

### `view.set.tab` — Set view tab

Switch the canvas view tab (plan, 3d, section).

**Voice examples:**
- "Switch to plan view."
- "Show the section cut."

## Shape

### `add.shape` — Add shape

Drop a stencil onto the canvas at the given coordinates. Coordinates and sizes are in INCHES: multiply feet by 12.

**Voice examples:**
- "Add a rectangle pool, twenty five feet by ten feet."
- "Drop a swim out bench on the left side."
- "Add a sun shelf."

### `delete.shape` — Delete shape

Remove one or more shapes from the canvas.

**Voice examples:**
- "Delete the bench."
- "Remove the selected shapes."

### `duplicate.shape` — Duplicate shape

Duplicate a shape and place it adjacent to the original.

**Voice examples:**
- "Duplicate the pool."
- "Make a copy of the spa."

### `move.shape` — Move shape

Translate the given shape by an absolute or relative position.

**Voice examples:**
- "Move the spa over to the right."
- "Nudge the pool down."

### `pool.depth.set` — Update pool depth profile

Patch the depth profile of the selected pool. Depths are in FEET; sun-shelf and bubbler heights are in INCHES, since those are spoken in inches.

**Voice examples:**
- "Raise the sun shelf two inches."
- "Set the deep end to seven feet."

### `pool.flip` — Flip shape

Mirror a shape across its X or Y axis.

### `pool.geometry.update` — Update pool geometry

Update length, width, average depth, shallow/deep depth, or slope of the selected pool. All measurements are in FEET.

**Voice examples:**
- "Make the pool deeper at the deep end."
- "Lengthen the pool to thirty feet."

### `pool.lock.ratio` — Lock aspect ratio

Constrain L/W proportion when resizing.

### `pool.material.set` — Set pool material slot

Apply a material to a specific surface slot of the selected pool (interior, coping, or tile band).

**Voice examples:**
- "Change the interior to PebbleTec Cobalt."
- "Set the coping to travertine."

### `pool.shape.set` — Set pool footprint

Switch a pool between a rectangular and an elliptical footprint.

### `resize.shape` — Resize shape

Resize a shape to explicit width and height, in INCHES: multiply feet by 12.

**Voice examples:**
- "Resize the pool to twenty by ten feet."
- "Make the spa six feet wide."

### `rotate.shape` — Rotate shape

Rotate a shape by a given angle in degrees.

**Voice examples:**
- "Rotate the pool ninety degrees."
- "Spin the deck a little to the left."

### `select.shape` — Select shape

Select one or more shapes on the canvas.

**Voice examples:**
- "Select the pool."
- "Select the deck and the spa."

### `set.shape.material` — Set shape material

Apply a material or finish to a shape.

**Voice examples:**
- "Change the deck to pavers."
- "Set the pool finish to pebble."

### `shape.hide` — Toggle layer visibility

Hide or show a shape on the canvas without deleting it.

**Voice examples:**
- "Hide the spa."
- "Show the deck."

### `shape.lock` — Toggle layer lock

Lock or unlock a shape so it cannot be moved or edited from the canvas.

**Voice examples:**
- "Lock the survey overlay."
- "Unlock the pool."

### `shape.rename` — Rename shape

Rename a shape in-canvas (e.g., from the inspector selection card).

**Voice examples:**
- "Rename the pool to Backyard Lap Pool."

## Measurement

### `calculate.measurements` — Recalculate measurements

Recompute area, perimeter, gallons, deck area, and other measurements for the current drawing.

**Voice examples:**
- "Recalculate measurements."
- "Update the numbers."

### `set.pool.depth` — Set pool depth

Set the shallow and/or deep end depths of a pool.

**Voice examples:**
- "Set the shallow end to three feet."
- "Set the deep end to five and a half feet."

### `set.pool.targetArea` — Resize pool by target area

Scale a pool proportionally to match a target surface area.

**Voice examples:**
- "Resize the selected pool to two hundred thirty eight square feet."
- "Make the pool three hundred square feet."

## Pricing

### `add.priceBookItem` — Add price book item

Add a new line item to the active price book.

**Voice examples:**
- "Add a new price book item for salt cell maintenance."
- "Add an upgrade for LED lighting."

### `generate.quote` — Generate quote

Build a quote from the current drawing measurements, selections, and price book.

**Voice examples:**
- "Show me the quote."
- "Generate the quote."

### `select.equipment` — Select equipment

Choose equipment options (heater, pump, sanitation, lighting, etc.) for the project.

**Voice examples:**
- "Add a Pentair salt system."
- "Use the heat pump heater."
- "Pick the premium light package."

## Validation

### `run.validation` — Run validation

Run the validation engine against the current project and return any warnings or blocking errors.

**Voice examples:**
- "Run validation."
- "Check the project for issues."

## Export

### `export.constructionPacket` — Export construction packet

Render the construction-facing packet PDF with detailed measurements and specs. Defaults to 11×17 (Tabloid).

**Voice examples:**
- "Export the construction packet."
- "Generate the construction PDF."
- "Print the construction packet on letter paper."

### `export.customerProposal` — Export customer proposal

Render the customer-facing proposal PDF for the project.

**Voice examples:**
- "Export the customer proposal."
- "Generate the proposal PDF."

### `export.screenEnclosureQuote` — Export screen enclosure RFQ

Render a request-for-quote document for the screen enclosure subcontractor. Hides pricing by default.

**Voice examples:**
- "Export the screen enclosure quote."
- "Generate the screen RFQ."
- "Send the screen enclosure quote with retail subtotal visible."

### `export.sitePlan` — Export site plan

Render the site plan PDF for permit submission — title block, survey overlay, setbacks, and signature blocks.

**Voice examples:**
- "Export the site plan."
- "Generate the permit site plan."

## Template

### `apply.shapeTemplate` — Apply shape template

Insert a saved shape template onto the canvas.

**Voice examples:**
- "Apply the standard rectangle pool template."
- "Drop in the kidney pool template."

### `save.shapeTemplate` — Save shape template

Save the current selection as a reusable shape template.

**Voice examples:**
- "Save this as a template called Standard Backyard."
- "Save shape as a template."

### `template.scene.apply` — Apply scene template

Put a saved scene into this project, either alongside what is already drawn or in place of it.

**Voice examples:**
- "Start this project from the standard backyard template."
- "Apply my saved scene."

### `template.scene.delete` — Delete scene template

Remove a saved scene. Projects already started from it are untouched.

**Voice examples:**
- "Delete the standard backyard template."

### `template.scene.list` — List scene templates

The scene templates this organization has saved, most recently updated first.

**Voice examples:**
- "What scene templates do we have?"
- "List my saved scenes."

### `template.scene.save` — Save scene as template

Save this project's drawing as a reusable scene, so later projects can start from it instead of an empty sheet.

**Voice examples:**
- "Save this scene as a template called Standard backyard."
- "Save this layout so I can start from it next time."

### `template.scene.setDefault` — Set the starting scene

Choose which saved scene new projects start from. Pass no template to go back to starting empty.

**Voice examples:**
- "Make this the scene new projects start from."
- "Start new projects empty again."

## Auth

### `auth.signOut` — Sign out

Sign the current user out of the session.

**Voice examples:**
- "Sign me out."
- "Log out."

## Settings

### `settings.update` — Update setting

Update an organization-scoped application setting by key.

**Voice examples:**
- "Update the default deck material to pavers."
- "Change my company default coping color."

## Scene

### `sun.run.study` — Run sun study

Animate the sun across the day from sunrise to sunset.

**Voice examples:**
- "Run a sun study."
- "Show me the day."

### `sun.set.time` — Set sun time

Set the sun-study clock to a given time of day (minutes past midnight).

**Voice examples:**
- "Set the sun to four PM."
- "Show afternoon shade."

## Palette

### `palette.open` — Open command palette

Open the ⌘K command palette.

**Voice examples:**
- "Open the command palette."

### `palette.run.suggestion` — Run a palette suggestion

Dispatch a palette suggestion which delegates to an inner command id.

## Import

### `import.calibrate.set` — Set image scale

Set the pixels-per-inch scale for an import session. The manual two-point fallback when no grid, labeled dimension, or scale bar was resolved.

**Voice examples:**
- "Calibrate this drawing: one square is one foot."
- "Set the scale from these two points."

### `import.image.analyze` — Analyze source image

Run classify and extract over a source image, writing one ImageAnalysis row per stage. Idempotent and cached on (sourceImageId, stage, extractorVersion).

**Voice examples:**
- "Analyze the sketch."
- "Read the dimensions off this plan."

### `import.image.upload` — Upload source image

Register uploaded bytes as a SourceImage: sha256 dedupe, magic-byte sniff, EXIF strip, downscale, thumbnail.

**Voice examples:**
- "Upload this sketch."
- "Add a site plan photo."

### `import.intake.link.create` — Create customer upload link

Mint a public intake link a customer can use to send inspiration photos, a sketch, or a survey. Submissions land as a draft project with an import session waiting.

**Voice examples:**
- "Create a customer upload link."
- "Make an intake link for the spring campaign."

### `import.intake.link.list` — List customer upload links

Every customer upload link this organization owns, newest first, with how many submissions each has received.

**Voice examples:**
- "Show me my customer upload links."

### `import.intake.link.update` — Update customer upload link

Rename a customer upload link, change its expiry, or deactivate it. A deactivated link stops accepting uploads immediately and gives visitors the same response as a link that never existed.

**Voice examples:**
- "Deactivate the spring campaign upload link."
- "Rename this intake link."

### `import.intent.apply` — Apply imported design

Write the reviewed design intent into the project as shapes, pool fields, and notes. Transactional, one undo entry, one audit row.

**Voice examples:**
- "Apply the imported design."
- "Build this into the project."

### `import.intent.patch` — Edit extracted design

Apply a human correction to the extracted design intent. Every edit is a command so the audit log records exactly what the model got wrong.

**Voice examples:**
- "The pool is thirty-two feet, not thirty-four."
- "Change the deck material to travertine."

### `import.session.create` — Start image import

Open an import session: the reviewable unit that spans every image in one ingestion and holds the extracted design intent.

**Voice examples:**
- "Start an import from a sketch."
- "Import a site plan into this project."

### `import.session.discard` — Discard image import

Abandon an import session without writing anything into the project.

**Voice examples:**
- "Discard this import."
- "Cancel the import."

