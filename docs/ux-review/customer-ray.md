# Pool Forge: one real job, start to finish

**Who I am.** Ray. 22 years building pools. I quote 6 to 10 jobs a week. I have paid for three
pieces of software that were going to save me time and each one cost me evenings instead. My
daughter told me to try this one.

**The job.** Mrs Alvarez. 30 by 15 rectangle, spa, sun shelf, paver deck all round, heater. Her
yard falls about two feet from the house to the back fence. She wants a price. I sat down to do
it the way I do it on a Tuesday night: fast, one pass, send it.

**What happened.** I got a document out the other end. It says the wrong pool size, it drew her
two pools side by side, it charges her for a concrete deck she didn't ask for, and the link I'd
actually send her shows a different price than the one on my screen. Not a little different.
$110,639 on mine, $0 on hers.

Below is everything, ranked, with the actual words and numbers off the screen.

---

## BLOCKERS: these end the job

### 1. The link I send the customer shows a completely different price than my copy

This is the one that would get me sued or fired.

I built the job, priced it, hit **Create link** on the project page ("Create a private link the
customer can open to view and accept this proposal. No sign-in required."). I opened that link in
a clean browser, the way Mrs Alvarez would.

My screen, `/projects/…/proposal`:

```
Pool Base — Wetted Area   600     $85.00      $51,000
Concrete Deck           1,540     $14.00      $21,560
Travertine Coping         148     $42.00       $6,216
Variable Speed Pump         1  $1,750.00       $1,750
LED Pool Light              3    $450.00       $1,350
                              SUBTOTAL        $81,876
                        Sales tax (6%)         $4,913
                      TOTAL INVESTMENT        $86,789
```

Her screen, same moment, `/share/acsMVn1fHujIwp3-iNhapzigsUOOG_zu`:

```
PLAN VIEW
No shapes drawn

POOL SPECIFICATIONS
Dimensions      Not specified
Depth           Not specified
Surface area    0 sqft

INVESTMENT SUMMARY
Variable Speed Pump   1   $1,750.00   $1,750
LED Pool Light        3     $450.00   $1,350
                      SUBTOTAL        $3,100
                TOTAL INVESTMENT      $3,286
```

Then I added the heater and the spa to the price book. My copy went to **$110,639**. Her copy went
to **"No quote items yet. TOTAL INVESTMENT $0"**.

And underneath that $0 there is a box that says **"Type your full name to accept this proposal"**
with an **Accept proposal** button. I typed a name and clicked it. It came back:

> **Accepted by Maria O'Alvarez on August 22, 2026. Thank you.**

So the software will happily record a customer accepting a proposal that shows no pool, no deck,
no dimensions, and a total of zero dollars. If she does that and then holds me to it, what am I
holding? I would never send that link. Which means the share feature, the accept feature, and the
whole "send it today" story are off the table.

**Blocker.** Nothing else on this list matters until this is fixed.

### 2. The same design gives two different prices depending on when you look

Eight objects on the sheet. I did not touch anything. I reloaded the editor.

- Before reload: `LIVE QUOTE $43,606` · contribution `$41,138` · Pool Base `$25,500` · Concrete Deck `$10,780`
- After reload: `LIVE QUOTE $85,358` · contribution `$80,526` · Pool Base `$51,000` · Concrete Deck `$21,560`

Identical geometry readout both times (600 sq ft / 148 LF / 17,953 gal / 1,192 sq ft). The price
exactly doubled. In-session it counts one copy of each duplicated object; after a reload it counts
both. So the number on my screen while I am talking to a customer is not the number the system
believes.

I cannot read a price off a screen that does this. **Blocker.**

### 3. I cannot delete anything

I dropped a pool, the drag didn't seem to take, so I did it again. Now I had two. Standard
Tuesday-night behaviour. Then I tried to remove one.

- Select the layer, press **Delete**: nothing. No toast, no error, layer count stays at 3.
- **Backspace**: nothing.
- **Right-click** the layer row: no menu.
- Hover the layer row: no trash icon (there IS a trash icon on grade elevation rows, so I know
  what one looks like in this app).
- `⌘K` → typed "delete": the only result offered was **"RUN SUN STUDY …"**.
- `⌘Z` undo, three times: layer count stayed at 3, quote stayed at $92,828.

There is no way to remove an object. Once you fat-finger a stencil you either live with the
double charge or you throw the project away and start over. I threw one away.

**Blocker.**

### 4. The Plan view draws nothing

I clicked **Plan** (bottom left). The canvas went completely white. Not "empty grid". White. No
grid, no ruler, no origin, no pool. I clicked **TOP**. Blank. I clicked **FIT** ("Fit everything
in view"). Blank, and it even made the one pool that WAS visible in 3D disappear.

Eight objects in the layer list. Zero on screen. The only view that renders anything at all is the
default ISO angle.

Plan view is the view. It's what I show the customer, it's what the crew works off, it's what goes
to the county. It draws nothing. **Blocker.**

### 5. The command palette's "Add" commands are all broken, and they show me a database error

The empty canvas tells you what to do: *"No layers yet. Drop a stencil or use ⌘K → Add to start."*

So I did. `⌘K` → **ADD A RECTANGLE POOL**. Result, in a toast in the corner:

> **invalid input: stencilId: Required; x: Required; y: Required**

Same thing for **ADD A TANNING LEDGE**, **ADD A WATERFALL**, **ADD 2 LED LIGHTS**. All four.
Every single "Add" the app suggests to me fails, and fails by showing me the guts of the program.

The app's own top suggestion is `POOL HAS NO MEASURED AREA — DRAW A POOL SHAPE`, and the command
it offers to fix it is one of the broken ones. **Blocker.**

### 6. The price book has five items in it. It cannot price a pool.

Settings → Price book → **"Active: Default Price Book v1 · 5 items"**:

| | |
|---|---|
| Travertine Coping | LF · $42.00 |
| Concrete Deck | SQFT · $14.00 |
| Variable Speed Pump | EACH · $1,750.00 |
| LED Pool Light | EACH · $450.00 |
| Pool Base — Wetted Area | SQFT · $85.00 |

No heater. No spa. No paver deck. No excavation, no plumbing, no electrical, no gas line, no
permit, no equipment set, no startup, no labour of any kind. That is not a price book, it's a
placeholder.

To be fair: I added a heater, a spa and a salt system myself via **Add item**, and the proposal
picked all three up automatically off the "Include heater" / "Include salt system" checkboxes.
That worked and I was pleasantly surprised. But out of the box the tool physically cannot produce
a number for the job in front of me. **Blocker** as shipped, downgraded to serious once someone
loads a real book.

---

## SERIOUS: I'd lose money or look stupid

### 7. The stencil lies about its own size

I dragged the one labelled **"Standard rectangle · 30' × 14'"**. What landed was:

> Rectangle pool
> **25.0' × 12.0'** · avg 4.0' deep

Layer list: `25' × 12'`. Every stencil does it:

| Palette says | What lands |
|---|---|
| Standard rectangle 30' × 14' | 25' × 12' |
| Spa 8' × 8' | 7' × 7' |
| Sun shelf 8' × 5' | 8' × 4' |
| Paver deck 40' × 24' | 35' × 22' |

I picked a shape because of the number written under it. The number written under it is not what
I get. If I hadn't checked, Mrs Alvarez's proposal would have gone out saying 25 × 12 for a pool
I sold her as 30 × 15, which is exactly what it did say, see below.

### 8. The proposal ignores what I typed into the project form

On the project page I filled in Depth (shallow) **3.5**, Depth (deep) **6**, clicked **Save**, got
a "Saved" toast. The proposal prints:

> Depth — **3 ft shallow / 5 ft deep**

Those are the stencil's defaults. My saved values are on the record and the customer document
throws them away. Same for Interior finish and Sanitization, which both print as **blank rows** on the
customer proposal even though I ticked "Include salt system".

### 9. The proposal draws two of everything, in a row, in a white void

PLAN VIEW on the customer proposal, verbatim from the page:

```
Pool 25×12 ft    Spa 7×7    Sun shelf 8×4    Paver deck 35×22 ft
Pool 25×12 ft    Spa 7×7    Sun shelf 8×4    Paver deck 35×22 ft
```

Two pools, two spas, two shelves, two decks, laid out left to right like clip art on a shelf. The
deck is a **bright purple rectangle sitting next to the pool**, not around it. There is no house,
no property line, no north arrow, no scale.

If I hand Mrs Alvarez a page with two pools on it, the conversation is over and I've spent the
evening for nothing.

### 10. The money table contradicts the spec table on the same page

On one sheet of paper:

- DECK SPECIFICATIONS → **Deck material: Paver**
- INVESTMENT SUMMARY → **Concrete Deck · 1,540 · $14.00 · $21,560**

I placed paver decks. It bills concrete. (It bills concrete because concrete is the only deck line
in the price book, but the customer doesn't know that; she just sees me quoting her a product she
didn't ask for.)

Also on the same sheet:

- POOL SPECIFICATIONS → **Wetted area 1,192 sqft**
- INVESTMENT SUMMARY → **Pool Base — Wetted Area · 600 · $85.00**

The line is named after wetted area and priced off surface area. First customer who reads carefully
catches that and I look like I'm padding.

And 1,540 sq ft of decking around a 25 × 12 pool is a tennis court. It's 1,540 because it counted
both duplicate decks, the same duplicate the app won't let me delete.

### 11. The heater is "Included" and costs $0

Straight off the proposal, before I built the price book myself:

> EQUIPMENT & FEATURES
> **Heater — Included**

And in the Investment Summary: no heater line. Nothing. I have told the customer in writing that a
heater is included and charged her nothing for it. That is four to six thousand dollars out of my
pocket per job, and it's in writing.

Same story for the spa and the sun shelf: both drawn on the plan, both absent from the price.
A spa is fifteen grand.

### 12. Coping costs $28/lf in the designer and $42/lf on the quote

Right-hand panel, with the pool selected:

> COPING
> **Travertine — Ivory** · coping · **$28.00/lf**

Quote tab, same session:

> **Travertine Coping · 148 × $42 · $6,216**

$28 is the cost, $42 is the retail. The design panel shows me cost and calls it the price. Show a
customer that panel over your shoulder and you've just published your margin.

### 13. Nothing stops garbage numbers, and the quote follows them anywhere

I typed **99999** into the length field. Accepted. No warning, no clamp.

> Rectangle pool
> **99999.0' × 15.0'** · avg 4.0' deep
> SURFACE AREA **1500585** sq ft · PERIMETER **200176** LF · VOLUME **44,900,624** gal
> **LIVE QUOTE $144,116,399**

A hundred and forty-four million dollars. Validation badges at the bottom: **1 error, 4 warnings,
7 passes**. One error. For a nineteen-mile pool.

Then I blanked the width field: accepted, field went empty, area didn't change. Then I typed
**-40** into length: accepted, a negative-length pool. Still no error. All of it saved.

While all this was going on the 3D pool on the canvas **never changed size once**. I set 30 × 15,
the header said 30.0' × 15.0', the layer said 30' × 15', and the picture stayed exactly the pixels
it was at 25 × 12. Picture and numbers are not connected.

### 14. Placing a stencil works about half the time, and there's no hint how it works

Clicking a stencil does nothing visible. Dragging a stencil does nothing. What works is: **click it
first, then drag it**, and even then it landed 5 times out of 9 attempts for me. Nothing on screen
told me about the click-first step; I found it by accident.

That's how I ended up with three stacked pools in the first place: it looked like nothing happened,
so I did it again. And again. Only one pool was visible on the canvas the whole time; the layer
list said 3.

**A tool that silently no-ops half the time plus a tool with no delete equals a wrecked project.**

### 15. Grading: I told it 2 feet of fall and it told me 1 foot

Grade tab → **Site grading [x] On**. Panel offers Datum (ft) and elevation rows. Each row is a
number box and a free-text box with the placeholder **"where"**. That's it. No way to put a point
on the drawing, so my survey is just a note to myself.

I entered `0 ft` / `At house slab` and `-2 ft` / `Back fence`. It reported:

```
Cut               0 yd³
Fill             80 yd³
Fall across site  1 ft
Steepest slope    0%
```

Two points two feet apart and it says the fall is one foot. Zero cut on a sloping lot, which never
happens. 80 cubic yards of fill (later 160), sixteen truckloads, appearing out of two
typed numbers with nothing priced against it. And "Steepest slope 0%" on a site it just said falls.

The 2-foot drop is the single biggest cost variable on Mrs Alvarez's job. It's the retaining wall,
the extra fill, the deck steps. This panel does not touch the price at all.

Also, turning grading on **drained the pool**: the water vanished and left an empty concrete box.
No explanation. It stays drained in the Customer view.

### 16. "Customer" mode is the mode you'd never show a customer

There is a **Customer** tab at the top of the editor. That is plainly the "turn the laptop around"
button. What it shows: an empty grey-brown concrete rectangle with no water in it, floating on a
blue-grey slab, with the layer list still open on the left reading `Standard rect… 25' × 12'` twice
and `Paver deck 35' × 22'` twice. No spa, no shelf, no deck rendered. A price tag reading
**$110,639 incl. tax** hovering over it.

That is a picture of a drained pool with an internal parts list next to a six-figure number.

### 17. "Project overview — Hardcoded for demo"

Top of the right-hand inspector panel, on every project I opened, in plain English:

> **Project overview**
> **Hardcoded for demo**

Right below the customer's name in the breadcrumb. If Mrs Alvarez reads that, everything else on
the screen becomes a lie as far as she's concerned.

Same category: an empty new project greeted me with **LIVE QUOTE $1,855** and a panel reading
**"CONTRIBUTION TO QUOTE $1,750 — Variable Speed Pump"** and a tip saying
**"Widening to 16' adds +$3,160"**, advice about a pool that did not exist yet. (A later new
project did the right thing and said *"No price yet — Nothing is drawn, so there is nothing to
price."* So it's inconsistent, not absent.)

### 18. Raw database errors on screen

Price book → Add item → I typed a big retail number. The page printed:

> Invalid `prisma.priceBookItem.create()` invocation: Error occurred during query execution:
> ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code:
> "22003", message: "numeric field overflow", severity: "ERROR", detail: Some("A field with
> precision 12, scale 4 must round to an absolute value less than 10^8.") …

Plus the Zod errors from #5. Two different flavours of "the programmer's error message is now my
error message".

### 19. The site plan is not a site plan

`/site-plan` says **"SITE PLAN — FOR PERMIT SUBMISSION"** at the bottom. It contains:

```
Jurisdiction  —          Parcel ID  —          Designer  —
SETBACKS & EASEMENTS
Front: —   Side: —   Rear: —   Easements: —
ACCESS & SITE NOTES
—
PLAN VIEW — NOT TO SCALE UNLESS DIMENSIONED
```

Nothing is dimensioned. There is no property line, no house, no north arrow, no scale bar. The
drawing block **overflows past the sheet border** on the right. And it draws two of everything,
same as the proposal.

No building department in Florida takes this. Meanwhile the editor itself clearly knows something
about setbacks: the inspector showed me `Setback 0' right (req. 5')` in red, and
`From house 28' — south face` for a house I never placed anywhere. That information doesn't reach
the sheet where it matters.

Construction packet has better bones (`All bonding to NEC 680`, `#3 REBAR · 18" OC`, `GAS LINE · 3/4"`
overlays in Build mode are genuinely good) but it prints **`Project ID: cmt537fkf00atsbuppjr2eu5x`**
across the top, the raw database key, on a sheet going to my crew. The site plan for the same job
prints `PJR2EU5X`. Two different IDs for one job.

### 20. Sales tax is applied to the whole contract

> SUBTOTAL $81,876 · **Sales tax (6%) $4,913** · TOTAL INVESTMENT $86,789

6% flat on the entire construction contract, hardcoded, with no way I could find to change it. In
Florida a pool contract is an improvement to real property and doesn't get taxed to the customer
like that. Putting a wrong tax figure in writing on a contract is not a cosmetic bug.

Also, in the editor's Quote tab, the same jump appears with **no label at all**: `Subtotal $80,526`
then `Total $85,358`. If Mrs Alvarez asks what the $4,832 is, the screen doesn't tell me.

---

## ANNOYANCES: cost me minutes, not money

- **The Pool section on the project page is nine blank text boxes with no placeholders and no
  dropdowns.** "Pool type", "Depth (shallow)", "Interior finish", "Equipment package",
  "Sanitization package", "Heater selection", "Lighting selection", "Deck material", "Coping
  material" are all free text, all empty, no examples, no units. Do I type `3.5` or `3'6"` for
  depth? Do I type `Gunite` or `Rectangle` for pool type? I guessed at all nine, and whatever I
  guess goes on the customer's document. And "Heater selection" is a text box in one section while
  "Include heater" is a checkbox in another section right below it. Which one drives the price?
  (Answer: the checkbox. The text box appears on the construction packet only.)

- **No "unsaved changes" warning, and a save that comes and goes.** I typed the job address, the
  pool type and both depths, then navigated away a second later. Email and phone survived. Job
  address, pool type, both depths and deck material were gone. It's a debounced autosave with a
  separate manual **Save** button, and while I'm typing nothing tells me which state I'm in. The
  editor *does* show `✓ Saved 7s ago` in the top bar, but only after an edit; on load it just
  shows `—`. Two different save models in one app and I never knew which one I was in.

- **The keyboard shortcuts don't work.** Pressing `R` (the tooltip says "Pool shape (R)") did not
  select the pool tool. Delete/Backspace do nothing. `⌘Z` does nothing. `⌘E` ("Export customer
  proposal") did nothing: no download, no tab, no page change. `⌘K` works.

- **Two tools look selected at once.** After clicking the pool-shape button it gets a blue ring
  but the arrow tool stays solid black. I couldn't tell which one was armed.

- **Three "coming soon" buttons sitting in the top bar.** `Comments — coming soon`,
  `Sun study — coming soon`, and — the big blue button in the corner — `Share link — coming soon`.
  Meanwhile the working share link is a different button on a different page. Also there's a Sun
  Study slider permanently parked over the bottom-left corner of my canvas, and the sun study
  button is the one that's coming soon.

- **Two different things are both called "Plan".** A Plan/3D/Section toggle bottom-left and a
  Plan/Design/Build/Customer toggle top-centre. They do different things.

- **The stencil thumbnails are all the identical blue square.** "Grecian", "Roman", "Freeform",
  "Standard" all show the same picture. And the names are truncated to `Standard …`, `Round co…`,
  `Rectangl…`, `Roman tw…`. The whole point of a shape library is seeing the shape.

- **Command palette shouts in all caps and leaks field names.**
  `SET BOTH SHALLOW AND DEEP END DEPTHS — POOL → DEPTHSHALLOW` and
  `NO EQUIPMENT PACKAGE SELECTED — EQUIPMENT → EQUIPMENTPACKAGE`. `depthShallow` is a name from
  inside the program. One row also renders a stray `T` in front of the text.

- **My dashboard is full of somebody's test junk.** `E2E mprwlf`, `Moves 0a7zbe`, `Moves 8lun3k`,
  `Moves m64f1h`, `E2E xn4ted`, `LSDKAJFLKASDJF`. Fifteen of them, ahead of my real work.

- **Validation counts move on their own.** Bottom right shows red/amber/green pills. Empty project:
  `2 / 5 / 5`. Same project after I clicked a layer: `1 / 4 / 7`. I changed nothing.

- **New project asks for a name and a customer name. That's it.** No address, no phone. I had to
  go into the project and fill those in on a second screen afterwards.

- **The proposal's terms reference a date that isn't printed.** *"Pricing valid until the proposal
  expiration date listed above."* There is no expiration date listed above. I left the field blank
  and nothing warned me.

- **The proposal is headed "Pool Forge Demo Co" with "POOL FORGE" under it as a tagline.** My
  customer's proposal carries the software vendor's name under my company name. Nothing prompted
  me to set my own.

- **Empty grade rows accumulate.** Every "+ Add" I clicked and didn't fill saved as a blank row.
  After two passes I had `4 elevations`: two real, two blank.

- **New project's breadcrumb reads `Pool Forge Demo Co › Customer › Quote Freshness Test`**, with the
  literal word "Customer" standing in where the customer's name goes.

---

## What actually worked

The 3D pool render is genuinely handsome, and **Build mode** (the rebar grid overlay reading
`#3 REBAR · 18" OC` and the yellow gas line tagged `GAS LINE · 3/4"`) is the first thing any
software has shown me that my crew would actually use. The proposal's typography is nicer than
what I send now. Autosave of geometry does hold across reloads. Apostrophes in names are handled
everywhere I tried ("Mrs Alvarez's Pool", "Maria O'Alvarez", "Ray's spec"). Double-clicking
Create and Duplicate correctly made one thing, not two. And once I loaded a heater, spa and salt
system into the price book myself, the proposal picked all three up off the checkboxes without
being asked. That's the good idea in here.

---

## What this costs me in a real week

I quote 6 to 10 jobs a week. Mrs Alvarez took me about an hour and I still don't have a document
I'd send, so call it 8 hours a week of evenings to produce nothing sendable. That's the small
number.

The real number is the one job where I don't catch it. Heater "Included" at $0 is $5,000.
A spa drawn and not priced is $15,000. A duplicate deck at 1,540 sq ft is $10,780 of concrete I
either eat or explain. And a customer clicking **Accept proposal** on a $0 document is a lawyer's
retainer.

I would rather spend the evening in Excel, which at least adds up the same way twice.

---

## Would I use this to quote a real customer tomorrow?

**No.**

Not tomorrow, not next month. It is not a matter of learning the tool; the tool cannot yet do the
one thing it exists to do, which is put a number in front of a customer that stays the same number
when she looks at it.

Fix these four and call me back:

1. The share link must show exactly what my copy shows. Same price, same drawing, same everything.
   Until then turn the Accept button off.
2. The same design must produce the same total every time it's loaded.
3. Let me delete things.
4. Make Plan view draw the pool.

Then I'll give you another hour. The bones are better than the three products I already paid for.
It's just that right now the bones are all that's there.
