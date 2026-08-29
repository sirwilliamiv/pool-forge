import type { Metadata } from 'next'

import {
  FeatureGrid,
  Gaps,
  Hero,
  PointList,
  ReadNext,
  SectionHead,
  Split,
} from '@/components/marketing/blocks'
import {
  MeasurementsPanel,
  Pip,
  Plate,
  PlanSheet,
  SectionSheet,
  VersionsPlate,
} from '@/components/marketing/plates'

// EVERY CLAIM ON THIS PAGE IS SOMETHING THE APP DOES TODAY.
//
// Same hard rule as `src/app/request-access/page.tsx`, for the same reason:
// Pool Forge is invite only, there are only a few beta builders, and one who
// arrives expecting something written here and finds it missing is lost in the
// first ten minutes. The "Not yet" block near the foot is not decoration; it is
// what makes the rest of the page checkable.
//
// Specifically not claimed here, because they are not built: photoreal
// rendering, flythrough video, 360 panorama, VR, AR, drawing on a phone, a
// plant library, and a voice agent. `src/modules/marketing/competitors.ts` is
// the canonical record of what is and is not true; check a claim against it and
// against the running app before changing a word.

export const metadata: Metadata = {
  title: 'The editor · Pool Forge',
  description:
    'Draw a pool in the browser with line, curve and freehand tools, stand it up in 3D on real ground, and read area, perimeter, volume and deck area straight off the drawing.',
}

const HREF = '/product/editor'

export default function EditorPage() {
  return (
    <div className="mk" data-accent="azure">
      <Hero
        eyebrow="The editor"
        headline={
          <>
            Draw it the way you&nbsp;sketch it. Then stand it&nbsp;up.
          </>
        }
        lead="Line, curve and freehand on a plan grid. What you draw becomes a measured shape you can orbit, light at any hour of the day, and sit on ground that already has the house on it."
        shapes={<EditorShapes />}
        plate={
          <Pip
            base={
              <Plate title="Ridgeline residence · Plan" meta="1 ft grid · snap on" bodyPad={false}>
                <div style={{ padding: '0.5rem 0.75rem 1.25rem', color: 'var(--fg)' }}>
                  <PlanSheet />
                </div>
              </Plate>
            }
            inset={<MeasurementsPanel />}
          />
        }
      />

      {/* ------------------------------------------------------- drawing */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Drawing"
            title="Start with a line, not a template"
            lead="Most pool software makes you pick a shape from a catalogue and then argue with it. Here the first thing you do is draw, and the catalogue is there for the parts you would rather not draw twice."
          />
          <FeatureGrid
            columns={3}
            cells={[
              {
                title: 'Line, curve, freehand',
                body: 'Click each corner, or drag and let it snap. Shift locks a segment horizontal, vertical or to 45 degrees; alt steps off the grid for one point. End near where you started and the path closes into an outline with an area.',
                meta: 'P · A · N',
              },
              {
                title: 'Then stand it up',
                body: 'Turn what you drew into a pool, a deck, a lanai or a grass area. The outline becomes the footprint. Nothing gets redrawn, and the arc you drew stays an arc all the way to the construction sheet.',
              },
              {
                title: 'Seventy-five stencils',
                body: 'Pool shapes, interior features, deck and house, construction symbols, water and outdoor. Seventeen pool shapes among them, from a standard rectangle to a freeform kidney with a spa.',
                meta: '5 catalogues',
              },
              {
                title: 'Drop it in and it fits',
                body: 'Drag an object over a space you have already drawn and the space lights up. Let go and the object sizes itself to what it landed in, rather than to a default nobody chose.',
              },
              {
                title: 'Select, group, lock, hide',
                body: 'The things you expect from a drawing tool, on the objects you drew. Everything is on a layer tree you can work down when the yard gets busy.',
              },
              {
                title: 'Comments on the drawing',
                body: 'Leave the note on the thing it is about, where the person who has to act on it will find it. Comments stay in the editor and never appear on a customer document.',
              },
            ]}
          />
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ----------------------------------------------------- one scene */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Views"
            title="One scene, three ways to look at it"
            lead="Plan, section and perspective are the same scene under a different camera. There is no second renderer, so the plan and the 3D cannot drift apart."
          />
          <Split>
            <div>
              <PointList
                points={[
                  {
                    lead: 'Orbit it.',
                    rest: 'The customer sees the yard from where they will stand in it, not from a fixed three-quarter view.',
                  },
                  {
                    lead: 'Sunrise to sunset on a slider.',
                    rest: 'Move the sun through the day and watch where the shade actually lands, which is the question every customer asks about the seating.',
                  },
                  {
                    lead: 'The ground is part of the design.',
                    rest: 'Existing grade and finished grade are both on the drawing. Cut and fill are reported apart and never netted against each other, because you pay to haul one and pay again to bring in the other.',
                  },
                  {
                    lead: 'The house is on the drawing.',
                    rest: 'So setbacks are measured from a wall that exists, and the lot line is a line rather than an assumption.',
                  },
                  {
                    lead: 'Everything in inches, under the hood.',
                    rest: 'Type a dimension in whatever unit you think in and it comes back in the unit you typed.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <Plate title="Ridgeline residence · Section" meta="Cut and fill" bodyPad={false}>
                <div style={{ padding: '1.5rem 1.25rem', color: 'var(--fg)' }}>
                  <SectionSheet />
                </div>
              </Plate>
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* --------------------------------------------------- measurement */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Measurement"
            title="Nobody measures the drawing"
            lead="Area, perimeter, volume, deck area, coping linear feet and the count of every feature come off the geometry, and they are recomputed the moment the geometry changes. There is no takeoff step, because there is nothing to take off."
          />
          <FeatureGrid
            cells={[
              {
                title: 'Surface area and perimeter',
                body: 'From the outline itself, including the curved parts. Widen the pool by a foot and both move before you let go of the handle.',
                meta: '512 sq ft · 96 lf',
              },
              {
                title: 'Volume in gallons',
                body: 'From the footprint and the depth profile you set, shallow end to deep end, rather than from an average somebody guessed.',
                meta: '19,150 gal',
              },
              {
                title: 'Deck, coping, features',
                body: 'Deck area by material, coping by the linear foot, and a count of every light, jet, drain and bench on the drawing.',
                meta: '600 sq ft · 96 lf',
              },
              {
                title: 'Earthwork by the yard',
                body: 'Cut and fill volumes from the difference between existing and finished grade, in the cubic yards an excavator is actually billed in.',
                meta: 'CU YD',
              },
            ]}
          />
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ------------------------------------------------------- versions */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Versions"
            title="Draw three, sell one"
            lead="Nobody agrees on the first design. A job holds up to forty of them, side by side, each with its own drawing and its own total."
          />
          <Split flip>
            <div>
              <PointList
                points={[
                  {
                    lead: 'Every design carries its price.',
                    rest: 'So the conversation is about the difference between forty-six thousand and fifty-eight, rather than about which drawing was which.',
                  },
                  {
                    lead: 'One of them is active.',
                    rest: 'Activate a design and it becomes the drawing the quote, the checklist and every export read. The others sit on the rack untouched.',
                  },
                  {
                    lead: 'Name them like a person would.',
                    rest: '"Scheme B, with the spa" beats a timestamp when you open the job again in three weeks.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <VersionsPlate />
            </div>
          </Split>
        </div>
      </section>

      {/* ----------------------------------------------------------- gaps */}
      <section className="mk-block">
        <div className="mk-shell">
          <Gaps
            title="The editor is a drawing tool, not a rendering house"
            items={[
              'Photoreal rendering',
              'Flythrough video',
              '360 panoramas',
              'VR and AR',
              'Drawing on a phone',
              'A plant library',
              'On-canvas resize handles',
              'A voice agent',
            ]}
          />
          <p className="mk-caption" style={{ marginTop: '1.5rem', maxWidth: '44rem' }}>
            The render is clear, not photographic. If a photoreal image is what wins your
            jobs, this is not the tool yet, and it is better to know that now than after
            you have moved your price book across.
          </p>
        </div>
      </section>

      <ReadNext currentHref={HREF} />
    </div>
  )
}

/** Hard-edged, full saturation, cropped by the viewport edge. */
function EditorShapes() {
  return (
    <>
      <span
        className="mk-shape mk-shape--bite mk-anim-shape"
        style={{
          background: '#00B6FF',
          width: '20rem',
          height: '20rem',
          right: '-6rem',
          top: '-7rem',
          ['--fly-x' as string]: '9rem',
          ['--fly-y' as string]: '-7rem',
        }}
      />
      <span
        className="mk-shape mk-shape--petal mk-anim-shape"
        style={{
          background: '#874FFF',
          width: '13rem',
          height: '13rem',
          left: '-7rem',
          bottom: '-3rem',
          animationDelay: '0.08s',
          ['--fly-x' as string]: '-8rem',
        }}
      />
      <span
        className="mk-shape mk-shape--check mk-anim-shape"
        style={{
          ['--shape-color' as string]: '#C7F8FB',
          width: '16rem',
          height: '10rem',
          right: '-3rem',
          bottom: '-3rem',
          animationDelay: '0.16s',
          ['--fly-y' as string]: '7rem',
        }}
      />
    </>
  )
}
