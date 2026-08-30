import { auth } from '@/lib/auth'
import { TopNav } from '@/components/dashboard/TopNav'
import { VoiceDock } from '@/components/voice/VoiceDock'

// The shell every authenticated screen sits inside (docs/brand-bible.md). It
// stays the quietest thing on screen — black-on-white chassis, one hairline,
// mono for metadata — so colour is free for the content each screen actually
// wants to say something with. `data-accent="frost"` sets the one accent
// family for the shell itself: ice and slate-mist are the two coolest, least
// saturated tints in the system, so a stray `bg-family-tint` here reads as
// neutral chrome rather than competing with whatever a busy screen (the
// editor, the price book) renders on top of it.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <div
      data-accent="frost"
      className="flex min-h-screen flex-col bg-theme-bg font-display text-theme-fg"
    >
      <TopNav />
      <main className="flex-1">{children}</main>
      {/* Signed in only, checked here rather than trusted to the middleware.
          The docs pages sit in this group and are deliberately public, so the
          middleware lets an anonymous visitor through and the shell renders
          around them: without this check a stranger gets an assistant who
          cannot do anything, because every command behind him is org-scoped and
          the surfaces route answers 401. A control that is present and cannot
          work is worse than one that is absent.

          It also lives in the shell so a session survives navigation: "take me
          to the price book" would otherwise end the call it was issued from. */}
      {session?.user ? (
        <VoiceDock userId={session.user.id} orgId={session.user.orgId} />
      ) : null}
    </div>
  )
}
