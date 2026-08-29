# Newcomer review: "have a play, see if you can do the Whitfield quote"

**Who I am for this review.** Dani, 26, design assistant, one month in the job. Good with computers,
no pool trade background, no Pool Forge training. My boss forwarded a login and one sentence of
instruction. Everything below is what I could work out from looking at the screen. I only opened the
source afterwards, and only to explain two things I could not explain by looking.

**How far I got on my own.** I logged in, made the project, found the editor, drew a pool, added a
waterfall and a light, found four documents and generated all four, found the price, and found
settings. So the happy path is walkable. But I reached the end **not trusting a single number in the
app**, and I lost the first pool I drew without being told. If this were a real customer I would not
have sent that proposal.

**Where I would have stopped and messaged my boss:** the moment I placed a pool, waited, reloaded the
page and the pool was gone with no warning and no error (Screen 5). I would have written "Hi, I think
the drawing tool isn't saving? Also is the price real? It said $1,855 before I drew anything." That
is roughly 12 minutes in.

Ranking used: **blocker** = I stop and ask for help; **serious** = I carry on but I don't trust it or
I get it wrong; **annoyance** = I notice it and shrug.

---

## Screen 1 — Sign in (`/login`)

**What I can tell it's for.** Signing in. Obvious.

**Obvious next thing?** Yes. Both fields are pre-filled and the button says "Sign in".

**Controls I can't guess.** A black circle with an "N" pinned to the bottom-left corner of every
single page in the product. Nothing labels it, it never goes away, and on the editor it sits directly
on top of the "Plan" button (Screen 4). *(Afterwards: it's the Next.js dev-build indicator. But I had
no way to know that, and it looks like a broken chat widget.)* — **annoyance**

**Anything broken/empty/unfinished?** The word "Pool Forge" does not appear anywhere on the login
screen. There is no logo and no product name. I logged into something and only found out what it was
called after I was inside. — **annoyance**

The helper line reads "Development build: the seeded demo account is filled in for you." I did not
know what a "seeded demo account" was, and "Development build" made me wonder if I'd been sent the
wrong link. — **annoyance**

**Silent actions?** No.

---

## Screen 2 — Projects / dashboard (`/dashboard`)

**What I can tell it's for.** A list of jobs. The subtitle "Draw the pool. Price the job. Export the
proposal." is the single most useful sentence in the entire product: it tells me the shape of the
work in seven words. Keep it, and use that structure everywhere else.

**Obvious next thing?** Yes, "+ New project" top right. Good.

**Anything broken/empty/unfinished?** Yes, badly. The list I was handed contains:

> `E2E mprwlf` · `Moves 0a7zbe` · `Moves 8lun3k` · `Moves m64f1h` · `Moves wvcdvx` · `Moves 7ftobb` ·
> `Moves nuoqam` · `Moves xl714t` · `E2E xn4ted` · `E2E 36shin` · `E2E e7jznw` · `LSDKAJFLKASDJF`
> (customer: `LAKSDJFLKAJSDF`)

Fourteen of the seventeen cards are test junk. As the new person, my first read was "this is a shared
company account and someone has been mashing the keyboard in it, I should be careful what I touch."
It also made me hesitate before creating my own project in case I was adding to a mess. — **serious**
(this is a demo/seed-data problem, but it is the literal first impression of the product)

There is **no search and no sort** on this list. With 17 cards and no search I had to read every card
to check whether a "Whitfield" project already existed. At 200 projects this page stops working. —
**serious**

**Controls I can't guess.** The status dropdown on the face of each card (`Draft ▾`) is a live
control, so I can change a job's status by mis-clicking on a card in a grid. I expected clicking a
card to open it. — **annoyance**

**Silent actions?** No. The kebab menu (Open editor / Duplicate / Archive / Delete…) is clearly
labelled, and "Delete…" has an ellipsis so I know it'll confirm. This is well done.

---

## Screen 3 — Project detail (`/projects/[id]`)

**What I can tell it's for.** All the paperwork about the job. Four sections: Project, Customer, Pool,
Selections. Plus a documents strip and a share block. Layout is clear.

**Obvious next thing?** "Open editor" is the primary dark button, so yes.

**Controls I can't guess — this is the worst part of this screen.** The whole "Pool" section is
**eleven bare text boxes with no placeholder, no dropdown, no example and no units**:

> Pool type · Depth (shallow) · Depth (deep) · Interior finish · Equipment package ·
> Sanitization package · Heater selection · Lighting selection · Deck material · Coping material ·
> Screen option

I checked: they are plain `<input>` elements with no placeholder and no datalist. So for
"Depth (shallow)" do I type `3`, `3'6"`, `42`, `3.5 ft`? For "Equipment package" am I supposed to
know your company's package names? Nobody told me any of them. Meanwhile the Materials panel in the
editor knows exactly four interior finishes by name ("PebbleTec — Cobalt", "White Plaster"…) and the
Price book knows the equipment — but this form won't offer me any of them. **These should be selects
fed from the price book, or at minimum have units in the label and an example in the placeholder.**
— **blocker for getting the quote right**; I would have left them all blank rather than guess, which
is exactly what I did, and that is why every document later printed "Not specified".

Two of those free-text boxes are then contradicted by checkboxes 30cm lower: "Heater selection" (text)
vs "Include heater" (checkbox); "Screen option" (text) vs "Include screen enclosure" (checkbox);
"Lighting selection" (text) vs "Pool lights (qty)". Which one drives the price? The Selections
subtitle says "These drive the quote, validation, and the customer proposal" — so are the text boxes
decorative? I could not tell. — **serious**

"Import from image" is a mystery button next to Open editor. *(Clicking it reveals a genuinely
excellent page: "Turn an image into a measured design — Upload a dimensioned sketch, a surveyor plat,
a concept render, or a backyard photo." That sentence should be the button's tooltip; the button
label alone made me think it meant "add a photo to the file".)* — **annoyance**

"Construction packet `11×17`" — I did not know 11×17 was a paper size until I opened it and saw
"Switch to Letter". "Screen enclosure RFQ" — I did not know RFQ meant request for quote until the
document said so in its own heading. Both are trade/office jargon on a first-run screen. —
**annoyance**

**Anything broken/empty/unfinished?** All four document buttons are live on a brand-new empty project.
I clicked "Screen enclosure RFQ" on a project with no screen enclosure and it cheerfully produced a
formal vendor RFQ reading "Height: —", "Option: —", "Coverage: 0.0 sqft (deck)". Nothing warned me
this document doesn't apply. — **serious**

**Silent actions?** "Save" at the bottom of a very long form, and a "Project created" toast appears
bottom-right on arrival. Fine.

---

## Screen 4 — The editor, first sight (`/projects/[id]/editor`)

First load took **25 seconds** on a white screen. No spinner, no "preparing your design". I thought
it had hung. — **annoyance** (I gather this is dev-mode compile, but there is still no loading state)

**What I can tell it's for.** Drawing. Eventually. What I actually see on arrival is a large grey
grid tilted away from me in perspective, completely empty, with the bottom-left toggle set to **3D**.
For a blank project this is the wrong opening move: I'm being shown a 3D view of nothing. I want a
top-down plan I can draw on, like graph paper. — **serious**

**Obvious next thing?** Partly. The Layers panel says:

> "No layers yet. Drop a stencil or use ⌘K → Add to start."

That is the only instruction in the entire editor and it's good, but it uses two words nobody gave
me: **"layer"** and **"stencil"**. I didn't know a stencil was a pool shape until I clicked the tab.
And "Drop a stencil" implies drag and drop, which is not how it actually works (you click a tool then
click the canvas). — **serious**

**Controls I cannot guess.** A lot.

- Ten square icon buttons along the bottom with a tiny letter under each: `V R S W L D B M T C`.
  No text. *(Hovering does give real tooltips — "Pool shape (R)", "Steps & shelves (S)", "Material
  brush (B)" — so this is recoverable, but only if you think to hover. On a first run I stared at a
  row of grey glyphs.)* — **annoyance**
- A **pink/purple sparkle button** at the end of that row, styled completely differently from
  everything else, with no label and no tooltip. *(It opens the command palette, which turns out to
  be the best thing in the app. Nothing tells you that.)* — **serious**
- A cluster in the bottom-right reading `⚠ 2  ⚠ 6  ✓ 4` with a chevron. Three coloured numbers, no
  word next to them. *(It's the validation checklist, and it's the most useful panel in the product.
  It needs the word "Checklist" or "Issues" on it.)* — **serious**
- Top bar: a speech-bubble icon, a play-triangle icon, an upload icon, "Scenes", and a "DU" circle.
  None labelled. I never worked out what the play triangle does. — **annoyance**
- Two different navigation strips both containing the word "Plan": `Plan / 3D / Section` bottom-left
  and `Plan / Design / Build / Customer` top-centre. Two "Plan" buttons, six inches apart, that do
  different things. — **serious**
- The header shows the project name followed by a bare em dash `—`. *(It's the save indicator, which
  only becomes "Saved 1s ago" after a save actually happens. Until then it's a dash that means
  nothing.)* — **serious**, see Screen 5.

**Anything broken/empty/unfinished?**

The right panel, on an empty project with nothing drawn, says:

> **Project overview** / **Hardcoded for demo**
>
> LIVE QUOTE **$1,855**
>
> CONTRIBUTION TO QUOTE **$1,750** — Variable Speed Pump $1,750
>
> ⓘ "Widening to 16' adds **+$3,160**"

Four things wrong at once, on the very first screen of the tool I was told to quote with:

1. It shows a price of **$1,855 for an empty canvas**. I confirmed this on a second, brand-new
   project: zero layers, price $1,855.
2. It literally prints the words **"Hardcoded for demo"** at the user. I am the user. I now assume
   every number on this screen is fake.
3. "Widening to 16' adds +$3,160" — widening *what*? There is no pool.
4. `SURFACE AREA 0 sq ft` sits directly above a dollar figure, which is self-contradicting.

— **blocker for trust.** Everything I did afterwards was under the assumption that the prices were
props.

**Overlaps.** The SUN STUDY panel and the "N" badge sit on top of the `Plan / 3D / Section` toggle —
the word "Plan" is physically covered. When the quote panel is expanded it covers the "Customer" tab
top-centre. — **annoyance**

---

## Screen 5 — Drawing a pool (and losing it)

Clicking the pool-shape tool drops a plain text list:

> Standard rectangle · Round corners · Grecian · Roman · Roman two master ·
> **Roman two point one master** · Freeform kidney · Standard steps · One step · Step sets ·
> Corner steps · Square steps · Spa · Rectangle pool and spa · …

**No pictures.** I am choosing the shape of a swimming pool from a list of words, several of which
are trade names I don't know. "Roman two point one master" reads like a software version number and
I assumed it was a bug. The list also runs off the bottom of the popover and behind the toolbar. —
**serious**

The Stencils tab in the left panel *does* show thumbnails — and **every single one of the 17
thumbnails is an identical plain blue rounded rectangle**, with the names truncated so that two of
them both read "Roman tw…". A shape picker where all the shapes look the same is not a shape picker.
— **serious**

Placing worked well: click canvas, pool appears, and the COMPUTED block fills in with real numbers
and real units:

> SURFACE AREA 300 sq ft · PERIMETER 74 **LF** · VOLUME 8,977 gal · **WETTED AREA** 596 sq ft

"LF" and "WETTED AREA" are trade jargon nobody explained, but they have units and they change when I
change the pool, which is more than the prices do. — **annoyance**

**The pool is not selected after you place it.** Position / Geometry / Material all still say "No
selection", so immediately after drawing I have no way to type in the dimensions I actually want. I
had to work out that I should click the layer row. — **serious**

**Then the blocker.** I placed a pool, waited 20 seconds, pressed ⌘S (nothing visible happened),
reloaded, and:

> LAYERS **0** — "No layers yet. Drop a stencil or use ⌘K → Add to start."

The pool was gone. The save indicator in the header never changed from `—`. No toast, no error, no
"you have unsaved changes" prompt when reloading. I reproduced this cleanly on a brand-new project.
Later in the session the header *did* say "Saved 1s ago" after I used the waterfall and light tools,
so saving works sometimes — which is worse than never, because I now can't tell which of my work is
real. — **BLOCKER. This is where I stop and message my boss.**

*(Afterwards, source check, to explain something I could not see: `POST /api/commands` for
`add.shape` returns `{"ok":true,"data":{"shapeId":"client-pending"}}` — the server acknowledges the
command but the shape stays client-side. A subsequent command appears to flush it. From the user
side, the entire signal is a dash that never changes.)*

---

## Screen 6 — Adding a feature

Two paths exist and they disagree.

**Path A, the command palette** (the unlabelled pink sparkle, or ⌘K). This is the best-designed thing
in the app. It offers, in plain English:

> SUGGESTED FOR THIS DESIGN — "Set both shallow and deep end depths", "Switch the interior finish to
> PebbleTec Cobalt and recompute the quote", "Run sun study — preview afternoon shade at the
> late-summer sun angle"
> ADD — "Add a tanning ledge", "Add a waterfall", "Add 2 LED lights", "Add a rectangle pool"

I clicked **"ADD A WATERFALL"**. Nothing happened. No layer, no error, no toast, no change to
anything. I clicked **"ADD 2 LED LIGHTS"** and got a black toast reading, verbatim:

> **invalid input: stencilId: Required; x: Required; y: Required**

That is a developer error message, in the customer-facing product, from the friendliest and most
discoverable feature in it. — **BLOCKER for "add a feature"** via the path a newcomer will actually
take. (And the silent failure of "Add a waterfall" is worse than the error, because I'd have believed
it worked.)

The palette also has an **"ACTIONS"** heading at the bottom with nothing underneath it. — **annoyance**

Every palette row and every checklist row prints a raw internal field name in caps:
`POOL → DEPTHSHALLOW`, `EQUIPMENT → EQUIPMENTPACKAGE`, `EXPORT → PROPOSALEXPIRESAT`. These mean
nothing to me and look like leaked code. — **serious**

**Path B, the toolbar tools.** Clicking the "Water feature (W)" tool then clicking the canvas *does*
work — a "Waterfall 5' × 2'" appears in Layers. But selecting the tool gives **no instruction at all**
about what to do next; the tool just lights up and waits. And the placed light and the placed
waterfall get the *same droplet icon* in the layer list, while the inspector titles the selected
object generically as **"Stencil / stencil"** even though the layer list calls it "Waterfall". —
**serious**

**Neither feature changed the price by one cent.** Before waterfall + light: $41,546. After: $41,546.
The quote breakdown says "Lighting & features **$0**". So in this product, water features and lights
are free. — **serious**

---

## Screen 7 — Finding the price

Three places show a price and **no two of them agree**.

**(a)** The right panel has a tab literally called **"Quote"**. I clicked it, expecting the price.
It says:

> Select something to inspect.

The tab named Quote shows nothing about the quote unless you have an object selected. Same for
"Specs". — **serious**

**(b)** The LIVE QUOTE panel, expanded:

| Row | Value |
|---|---|
| Pool shell & finish | $39,194 |
| Spa | $0 |
| Equipment | $0 |
| Deck & coping | $0 |
| Lighting & features | $0 |
| **Subtotal** | **$39,194** |
| Permits & misc | $2,000 |
| *(headline at top)* | **$41,546** |

39,194 + 2,000 = **41,194**, not 41,546. **The numbers on this panel do not add up**, there is no
"Total" row, and the headline is $352 adrift of its own arithmetic. Also "Equipment $0" and
"Deck & coping $0" while the panel six inches to the right lists "Travertine Coping $3,444" and
"Variable Speed Pump $1,750" — so the categories are wrong too. — **blocker for trusting the price**

**(c)** The actual customer proposal document, which is correct and self-consistent:
subtotal $39,194 + Sales tax (6%) $2,352 = **$41,546**. So the editor invented a "Permits & misc
$2,000" line that does not exist in the proposal, and hid the sales tax line that does. The
construction packet meanwhile prints the total as **$41,545.64**.

Three documents, three different explanations of the same number. As the person who would have to
stand in front of the Whitfields and read it out, I cannot use this. — **blocker**

Also: "Widening to 16' adds +$3,160" is displayed permanently. I widened the pool from 12' to 16'.
Surface area went 300 → 400 sq ft. The price did not move at all, and the message still said
"Widening to 16' adds +$3,160" *after* I had widened it to 16'. — **serious**

---

## Screen 8 — The four documents

Credit where it's due: **these are the strongest screens in the product.** The Customer proposal is
handsome, correctly laid out, has real terms and disclaimers, and its arithmetic works. The
Construction packet is thorough (NEC 680 bonding notes, VGB returns, signature blocks). The Site plan
has a proper title block and sheet number SP-1. If I were shown only these I'd think the product was
finished.

Problems visible on the page:

- On **all three** drawings, the feature labels stack on top of each other into an unreadable clump:
  `Light 0.5×0.5` printed directly over `Waterfall 5×2` in a single grey box. — **serious**
- The plan view draws my "Standard rectangle" pool as a **rounded-corner** rectangle. — **annoyance**
- I placed a light in the design; the proposal says "Pool lighting: **Not specified**". The design
  and the document don't talk to each other. — **serious**
- The construction packet prints **"Project ID: cmt52kjj8001rsbup5pj5vwja"** — a raw database id — on
  a sheet that goes to a builder. Every other document uses the tidy short form "5PJ5VWJA". —
  **annoyance**
- The construction packet's SELECTION TABLE is nine rows of `—` and its SYMBOL LEGEND lists eight
  symbols (equipment pad, access arrow, property line, setback line…) none of which appear on the
  drawing above it. — **serious**
- On the Screen enclosure RFQ, the buttons "Show internal pricing" / "Show retail subtotal" /
  "Print / Save as PDF (11×17)" overlap each other in the header, with a clipped stray word showing
  through. — **annoyance**
- "Print / Save as PDF" opens the browser print dialog rather than downloading a file. Workable, but
  "Documents" led me to expect a download. — **annoyance**

---

## Screen 9 — Finding settings

**The word "Settings" does not appear in the navigation.** The nav is: Dashboard · Price book ·
Customer uploads · Company · Docs. I found settings by guessing "Company", which opens
`/settings/company` and is titled "Company settings". So the pages know they're settings; the nav
doesn't say so. — **annoyance**

**Company settings** is clean and I understood all four fields immediately (Company name, Logo URL,
Brand color, Default sales tax (%)) — each with a one-line explanation underneath the section
heading. This is the pattern the rest of the app should copy. But there is no profile, no password
change, no teammates, and no units preference. — **annoyance**

**Price book** is good: real categories, `UNIT / COST / RETAIL / FLAGS` columns, "Import XLSX". The
`FLAGS` column shows "required" with no explanation of what a flag is or what required means. And
"Active: Default Price Book v1 · 5 items" implies there can be more than one price book, with no
visible way to make or switch one. — **annoyance**

**Customer uploads** has the best empty state in the product: *"Send a customer a link and they can
drop in inspiration pictures, a sketch, or their survey. Each submission arrives as a draft project
with the images attached."* and *"No upload links yet. Create one and send it to a customer."* That
is exactly what every other empty state in the app should sound like. — **good**

**Docs** turned out to be the engineering spec, not a user guide. It opens with:

> "11 tools you can use today, and **48 designed but not built**."

and each entry lists `ICON / INPUTS / OUTPUTS / SIDE EFFECTS / ERRORS / UNDO / VOICE`, with contents
like "dispatches add.shape", "updates editorStore.panX/panY", and — under the pool tool — the
sentence "**nothing is placed if the pointer moves more than four pixels, which reads as an orbit**".
That is a known bug, published to the customer, in the Help section. Telling a new starter that 48
of your 59 features don't exist is also a strange first impression. There is **no getting-started
guide anywhere in the product**. — **serious**

---

## Screen 10 — Sharing

"Share proposal — Create a private link the customer can open to view and accept this proposal. No
sign-in required." Clicked "Create link", got a URL with Copy / Open link / Revoke. Worked first
time, explained itself, no jargon. — **good**

---

## The three places a new user gets stuck

1. **The drawing doesn't reliably save, and nothing tells you.** Place a pool, wait, reload, it's
   gone. The save indicator is a bare `—` that only ever becomes "Saved 1s ago" after some other
   command happens to flush. No unsaved-changes warning, no error, ⌘S does nothing visible. This is
   the point I would have stopped and messaged my boss. **Blocker.**

2. **The price is not believable.** An empty project quotes **$1,855**. The panel prints the words
   **"Hardcoded for demo"** at the user. The breakdown does not add up ($39,194 + $2,000 vs a
   headline of $41,546). Adding a waterfall and a light changes it by $0. Widening the pool changes
   the area but not the price, while a permanent tip promises "Widening to 16' adds +$3,160". The
   editor, the proposal and the construction packet give three different totals. The whole job is to
   price a pool and I finished not trusting any figure. **Blocker.**

3. **The two most discoverable ways to add a feature both fail.** "Add a waterfall" in the command
   palette does nothing at all; "Add 2 LED lights" returns the raw text
   `invalid input: stencilId: Required; x: Required; y: Required`. It only works via an unlabelled
   toolbar glyph that gives no instructions once selected. **Blocker.**

Close behind, and cheap to fix: the eleven unlabelled, unitless, un-dropdowned free-text boxes in the
project's Pool section (I left them all blank, which is why every document printed "Not specified"),
and a shape picker where all 17 thumbnails are the same blue rectangle.

## What's genuinely good, and should be the model for the rest

- "Draw the pool. Price the job. Export the proposal." — seven words that teach the whole product.
- The validation checklist. "Set both shallow and deep end depths → Enter shallow + deep depth in
  Geometry section" is exactly right. It just needs a label instead of three coloured numbers, and
  it needs to stop printing `POOL · DEPTHSHALLOW`.
- The command palette's plain-English suggestions — once the commands behind them actually run.
- The Customer uploads empty state.
- The four documents themselves.
