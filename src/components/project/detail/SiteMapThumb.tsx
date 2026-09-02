'use client'

import * as React from 'react'

/**
 * A small satellite confirmation of the chosen parcel.
 *
 * Fetched through the session-authed proxy, so the Google key stays on the
 * server. Failure collapses to nothing: the thumbnail is confirmation, not
 * data, and a broken-image icon next to an address would read as the address
 * being wrong.
 */
export function SiteMapThumb({
  lat,
  lng,
  address,
  width = 320,
  height = 180,
  className,
}: {
  lat: number
  lng: number
  address: string
  width?: number
  height?: number
  className?: string | undefined
}) {
  const [failed, setFailed] = React.useState(false)
  if (failed) return null

  const src = `/api/site/staticmap?lat=${lat}&lng=${lng}&w=${width}&h=${height}`
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the proxy is
    // same-origin and authenticated; next/image's optimizer would refetch it
    // without the session cookie.
    <img
      src={src}
      alt={`Satellite view of ${address}`}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      className={`rounded-brand border border-theme-line object-cover ${className ?? ''}`}
    />
  )
}
