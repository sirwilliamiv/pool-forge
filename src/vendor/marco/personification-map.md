# Addy · Personification Map

The Inbox Admin assistant character. A single dark-navy blob with off-white arc eyes that lives on a fixed overlay above every page. It replaces the mic button as the face of the Gemini voice feature: it listens, talks, thinks, points at real UI, does the work, gets tired, and celebrates.

Design lineage: the Grok bot icon motion study (Benji Taylor) for the motion grammar, and a glass-lens material study for the finish. The body is a dark smoky glass puck: refractive rim with chromatic-dispersion streaks creeping around it, drifting smoke inside, matte icon-white crescent eyes with a soft drop shadow, and a soft shadow under the puck. Effects (ribbons, comet, ticks) carry a brushed-metal specular gradient. Rainbow stays reserved for high-energy moments.

## Motion grammar (measured from the source, 60fps frame study)

- **Morphs are fast, holds are long.** Every shape change lands in 100-180ms. The personality lives in the holds, which are never static: pendulum jiggles, breathing, glances.
- **Everything funnels through the droplet.** Big morphs collapse into a compact teardrop (~110ms, ease-in), then pop out as the new shape (~170ms, back-ease overshoot). This is what keeps it "one character".
- **The "!" is italic and alive.** Tilted ~12 degrees, tapered (wide top, narrow bottom), and it pendulum-swings with decay for the entire hold. The dot pops in separately with overshoot.
- **Thinking is a darkness wave.** Three dots; side dots sit at ~35% opacity and a wave of full darkness travels left to middle to right, with a slight size bump riding it.
- **Ribbons are flat and opaque.** Thick pastel arcs with round caps, tangled at random inclinations, passing both in front of and behind the body. They exit by shrinking into short ticks, not by fading.
- **The comet tail is short and braided.** Three flat-color strands hugging the dot for about two body-lengths, wagging; no long fading rainbow.
- **The spin flourish is the eyes taking a lap.** When re-forming from a dot state, the eyes slide once around the face like gloss on a rolling ball.

## Character rules (never break these)

1. **One character, always.** It can split into 50 pieces, but every piece belongs to it and everything slurps back into one face. No cuts, no teleports: every state change is a morph.
2. **Squash and stretch before every morph.** Wind-up squash, morph, overshoot, settle. This is what makes it feel alive instead of a sprite swap.
3. **Eyes carry the emotion.** No mouth, ever. Arc eyes: upturned arc is happy, oval is alert, downturned arc is suspicious, low flat line is sleepy. Eye poses are the vocabulary.
4. **Color is earned.** The body is always navy `#1e2a4a`, eyes are paper `#FAFAF7`, the badge is brand blue `#2563eb`. Rainbow appears only in high-energy states: working orbits, celebration ribbons, zoomies comet. Everything else is monochrome.
5. **Energy is real.** Work costs stamina. Low stamina bleeds into every state: slower morphs, droopier lids, heavier breathing. Success gives a little back, rest gives a lot back. The user should be able to tell it has had a long day.
6. **It respects the page.** pointer-events: none on the overlay. It points at things, it never blocks them.

## State catalog

| State | Trigger (Gemini voice lifecycle) | Body | Eyes | Motion | Effects (canvas) |
|---|---|---|---|---|---|
| `idle` | nothing happening | circle | neutral arcs, occasional blink, wandering glance | slow breathing, tiny drift | none |
| `listening` | mic open, user speaking | circle, leans toward the user | wide alert ovals | pulses with voice amplitude | soft blue rings emanating |
| `speaking` | Gemini audio playing | circle | happy arcs bouncing with speech rhythm | gentle bob, chatter squash | faint ripple ticks |
| `thinking` | model deciding what to do | splits into three gooey dots | none (dot states are eyeless) | dots pulse in sequence | none |
| `pointing` | tool selected, single UI target | dashes over, becomes a teardrop aimed at the element | alert, gaze locked on target | nudge-bounce toward the target | mini comet on the dash, blue pulse ring on the target |
| `swarm` | tool touches N targets (up to 50) | body crouches small, fires pointer pins at every target | small, watching the swarm | pins fly out with spring physics, wiggle in place | pin dots + blue arrival rings, gulp pops on recall |
| `working` | tool call in flight | circle, slow wobble spin | concentration squint | rotation wobble | rainbow orbit ribbons (the only place they appear with `celebrate` and `zoomies`) |
| `success` | tool returned OK | exclamation mark: tall capsule + gooey dot below | happy arcs | double bounce, settles back to face | none |
| `confused` | tool errored / did not understand | hexagon that tilts over | dizzy: one arc up, one arc down | wobble, small head shake | none |
| `notify` | something needs review | circle | hollow rings | perk-up bounce | blue badge pops in top-right, pulses |
| `celebrate` | big win: rule created, batch cleared, graduation | rounded triangle tumbling | wink | full tumble spins | rainbow ribbons + confetti burst |
| `zoomies` | page navigation, moving across screen | shrinks to a dot and streaks | none | curved dash across the stage | rainbow comet trail |
| `tired` | energy below 0.35 | circle, slightly deflated | heavy lids, slow blinks | slow, deep breathing | none |
| `dormant` | energy below 0.12 or long idle | tiny drifting dot | none | slow drift, holding its breath | none |
| `wake` | user returns / mic opens | dot regrows through an egg stretch (yawn) | blink twice, then neutral | stretch up, settle | none |

## Tool-calling choreography

The canonical sequence when the user asks Addy to do something:

```
mic opens            -> listening      (rings, amplitude pulse)
user stops talking   -> thinking       (three dots)
tool chosen, has UI  -> pointing/swarm (shows the user exactly what it is about to touch)
tool executing       -> working        (rainbow orbits; energy drains)
resolved OK          -> success        ("!" bounce; small energy refund)
resolved error       -> confused       (hexagon tilt; then notify if user action needed)
reply audio          -> speaking
done                 -> idle           (or tired, if the day has been long)
```

Multi-target tools (file 12 emails, flag 8 invoices) use `swarm`: one pin per target so the user sees the full blast radius before and during the operation, then a gooey recall where the body gulps each pin back and pops slightly with each swallow.

## Energy model

- Starts at 1.0. Displayed nowhere in production; expressed only through posture.
- `working` drains ~0.04/s. Each swarm pin costs 0.002. `success` refunds 0.04.
- Idle regenerates slowly (0.01/s), `dormant` quickly (0.08/s).
- Below 0.35 all states inherit droop: eyelids lower, morphs run ~20% slower, breathing deepens.
- Below 0.12 it excuses itself into `dormant` after finishing the current job. It never abandons a job to nap.

## Integration API (Gemini voice hooks)

One line per lifecycle event:

```js
const addy = new Addy(stageEl);
addy.set('listening');          // mic opened
addy.amp = level;               // feed live voice amplitude, 0..1
addy.set('thinking');           // turn complete, model running
addy.pointAt(el);               // tool chose one element
addy.swarm([el1, el2, ...]);    // tool touches many elements
addy.recall();                  // slurp the swarm back
addy.set('working');            // tool call in flight
addy.set('success');            // tool OK (auto-returns to idle)
addy.set('confused');           // tool error
addy.set('notify');             // review queue item created
addy.zoomTo({x, y});            // page transition / reposition
addy.set('dormant');            // user idle
addy.set('wake');               // user back
```
