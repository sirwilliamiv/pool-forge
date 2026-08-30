import type { Metadata } from 'next'

import { AUTH_VARIANTS, AuthStage } from '@/components/auth/AuthStage'
import { LoginForm } from '@/app/(auth)/login/login-form'

// A crit page, not a product page.
//
// Second round. The first put five unrelated directions up and Rail, Ledger and
// Field won, which turned out to be one direction seen three ways: the page
// splits, the wordmark takes one side, the form takes the other. These five are
// variations inside that idea.
//
// Shown full-page and stacked rather than in small frames side by side. A sign
// -in screen is only ever seen at full bleed, and judging one in a 34rem box is
// judging a different design: the type is the wrong size relative to the
// viewport, the split falls in the wrong place, and a composition that lives or
// dies on scale cannot be read at all. So each variant gets the whole viewport
// and you scroll from one to the next.
//
// The forms are real and live. Deliberately not linked from anywhere; it exists
// to be argued over and then deleted.

export const metadata: Metadata = {
  title: 'Auth compositions · design crit',
  robots: { index: false, follow: false },
}

export default function AuthCritPage() {
  return (
    <main className="bg-theme-bg font-display text-theme-fg">
      {/* One screen of preamble, so the set opens with what is being asked. */}
      <section className="flex min-h-screen flex-col justify-center px-8 py-16 sm:px-14">
        <div className="max-w-3xl">
          <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
            Design crit · round two · not shipped
          </p>
          <h1 className="mt-5 text-title1 font-medium tracking-[-0.04125rem] sm:text-display1 sm:leading-[0.95]">
            Five ways to split a page
          </h1>
          <p className="mt-8 max-w-2xl text-bodyXL leading-relaxed text-theme-muted">
            Rail, Ledger and Field all won the first round, and they are one idea seen three
            ways: the page splits, the name takes one side, the form takes the other. These
            five move the geometry inside that idea — what splits, where the split falls,
            which side carries colour, and whether the card respects the seam or crosses it.
          </p>
          <p className="mt-6 max-w-2xl text-bodyL leading-relaxed text-theme-muted">
            Everything else is held constant, so the argument stays about composition. Each
            one below is full bleed, because a sign-in screen is never seen any other way and
            judging one in a small frame is judging a different design.
          </p>
          <p className="mt-10 font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-faint">
            Scroll · five screens
          </p>
        </div>
      </section>

      {AUTH_VARIANTS.map((variant, i) => (
        <section key={variant.id} className="relative min-h-screen border-t border-theme-line">
          {/* The label floats over the composition rather than sitting above it,
              so nothing is pushed out of place and each variant really does get
              the whole viewport. */}
          {/* Crit chrome, kept out of the composition's way: the number pins to
              the top-left and the note sits along the bottom, because anything
              in the upper right lands on top of whatever the variant is doing
              there. Solid ink rather than an opacity modifier — Tailwind's
              `/90` shorthand does not apply to a colour defined as a bare
              `var()`, so it silently rendered as no background at all. */}
          <div className="pointer-events-none absolute left-0 top-0 z-40 px-6 py-5 sm:px-8">
            <span className="pointer-events-auto rounded-brand bg-theme-fg px-3 py-1.5 font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-bg">
              {String(i + 1).padStart(2, '0')} · {variant.name}
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-40 hidden px-6 py-5 sm:px-8 lg:block">
            <p className="pointer-events-auto max-w-2xl rounded-brand bg-theme-fg px-4 py-3 text-bodyS leading-snug text-theme-bg">
              {variant.note}
            </p>
          </div>

          <AuthStage variant={variant.id}>
            <LoginForm />
          </AuthStage>
        </section>
      ))}
    </main>
  )
}
