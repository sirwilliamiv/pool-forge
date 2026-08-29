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
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-accent="frost"
      className="flex min-h-screen flex-col bg-theme-bg font-display text-theme-fg"
    >
      <TopNav />
      <main className="flex-1">{children}</main>
      {/* Lives in the shell so a session survives navigation: "take me to the
          price book" would otherwise end the call it was issued from. */}
      <VoiceDock />
    </div>
  )
}
