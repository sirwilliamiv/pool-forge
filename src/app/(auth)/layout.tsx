import { AuthStage } from '@/components/auth/AuthStage'

// The auth surface: login, register, forgotten password, reset, invite.
//
// The composition lives in `AuthStage`, so this file stays the routing shell and
// the design is one import. Garden won the crit and the other five compositions
// are deleted rather than left behind as options nobody will pick.
//
// The brand faces are no longer loaded here. They load once in the root layout —
// which is what stopped the authenticated app rendering in the system stack —
// and loading them again per route group is duplication that would drift.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-accent="signal" className="font-display">
      <AuthStage>{children}</AuthStage>
    </div>
  )
}
