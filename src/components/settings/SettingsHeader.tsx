import Link from 'next/link'

// The one header shape all five settings screens share: a mono back-link,
// a title, and a description that can carry mono metadata (counts, dates)
// inline. Giving every screen the same shape here is what makes them read as
// one surface rather than five pages that happen to live under /settings.

export function SettingsHeader({
  title,
  description,
  backHref = '/dashboard',
  backLabel = 'Back to projects',
}: {
  title: string
  description?: React.ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-block font-brandMono text-formLabel uppercase tracking-[0.05em] text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
      >
        ← {backLabel}
      </Link>
      <h1 className="text-title2 font-medium text-theme-fg">{title}</h1>
      {description ? <div className="max-w-2xl text-bodyL text-theme-muted">{description}</div> : null}
    </div>
  )
}
