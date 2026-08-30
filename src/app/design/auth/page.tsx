import type { Metadata } from 'next'

import { AUTH_VARIANTS, AuthStage } from '@/components/auth/AuthStage'
import { LoginForm } from '@/app/(auth)/login/login-form'
import { ForgotPasswordForm } from '@/app/(auth)/forgot-password/forgot-form'

// A crit page, not a product page.
//
// Five compositions for the auth surface, each rendered twice: once with the
// real sign-in form and once with the real forgot-password form, because a
// composition that only works when the card is tall is not a composition, it is
// a coincidence. Same chassis, same card, same type throughout, so the argument
// is about layout rather than about which one got nicer buttons.
//
// Deliberately not linked from anywhere. It exists to be looked at, voted on,
// and deleted once one of them wins; promoting the winner is one line in
// `(auth)/layout.tsx`.

export const metadata: Metadata = {
  title: 'Auth compositions · design crit',
  robots: { index: false, follow: false },
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-brand16 border border-theme-line">
      <div className="border-b border-theme-line px-4 py-2">
        <span className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
          {label}
        </span>
      </div>
      {/* A fixed height so every variant is judged at the same size, and its own
          stacking context so a variant's cropped shapes cannot escape its box. */}
      <div className="relative isolate h-[34rem] overflow-hidden">{children}</div>
    </div>
  )
}

export default function AuthCritPage() {
  return (
    <main className="min-h-screen bg-theme-bg px-6 py-16 font-display text-theme-fg sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
          Design crit · not shipped
        </p>
        <h1 className="mt-4 text-title1 font-medium tracking-[-0.04125rem] sm:text-display2">
          Five ways to sign in
        </h1>
        <p className="mt-5 max-w-2xl text-bodyXL leading-relaxed text-theme-muted">
          Each one is a different composition rather than a different setting of the same
          one: where the wordmark sits, whether it runs horizontally or vertically, whether
          colour arrives as cropped shapes or as one full-bleed field, and whether the card
          floats or is anchored. Every other variable is held constant so the argument stays
          about layout.
        </p>

        <div className="mt-16 flex flex-col gap-20">
          {AUTH_VARIANTS.map((variant, i) => (
            <section key={variant.id}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <span className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="text-title3 font-medium tracking-[-0.04125rem]">{variant.name}</h2>
              </div>
              <p className="mt-3 max-w-2xl text-bodyS leading-relaxed text-theme-muted">
                {variant.note}
              </p>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Frame label="Sign in">
                  <AuthStage variant={variant.id}>
                    <LoginForm />
                  </AuthStage>
                </Frame>
                <Frame label="Forgotten password">
                  <AuthStage variant={variant.id}>
                    <ForgotPasswordForm />
                  </AuthStage>
                </Frame>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
