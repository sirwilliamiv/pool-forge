// Pure geographic math for the site import. Everything here is exact
// arithmetic on the Web Mercator / spherical-earth model; nothing touches the
// network or the database.
//
// Conventions, chosen once so every consumer agrees:
// - Editor inches: x grows east, y grows south. A north-up satellite image
//   therefore maps image-pixel axes directly onto editor axes.
// - The projection origin is the site's geocoded point; it lands at the
//   centre of the imported backdrop.

const EARTH_RADIUS_M = 6378137
const METERS_PER_INCH = 0.0254

// Meters per pixel at zoom 0 on a 256px Web Mercator tile at the equator.
const BASE_GSD = (2 * Math.PI * EARTH_RADIUS_M) / 256

export interface LatLng {
  lat: number
  lng: number
}

export interface PointInches {
  xInches: number
  yInches: number
}

/** Ground resolution of a Static Maps image, in meters per output pixel.
 * `scale` is the Static Maps scale parameter (2 doubles pixel density). */
export function metersPerPixel(lat: number, zoom: number, scale: 1 | 2 = 2): number {
  return (BASE_GSD * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom / scale
}

export function inchesPerPixel(lat: number, zoom: number, scale: 1 | 2 = 2): number {
  return metersPerPixel(lat, zoom, scale) / METERS_PER_INCH
}

/** Project a point into editor inches relative to an origin. Spherical
 * equirectangular approximation: at yard scale the error is far below the
 * assessor data's own accuracy. */
export function projectToInches(origin: LatLng, point: LatLng): PointInches {
  const latRad = (origin.lat * Math.PI) / 180
  const dLatRad = ((point.lat - origin.lat) * Math.PI) / 180
  const dLngRad = ((point.lng - origin.lng) * Math.PI) / 180
  const eastM = EARTH_RADIUS_M * Math.cos(latRad) * dLngRad
  const southM = -EARTH_RADIUS_M * dLatRad
  return { xInches: eastM / METERS_PER_INCH, yInches: southM / METERS_PER_INCH }
}

/** Inverse of projectToInches. */
export function unprojectFromInches(origin: LatLng, point: PointInches): LatLng {
  const latRad = (origin.lat * Math.PI) / 180
  const southM = point.yInches * METERS_PER_INCH
  const eastM = point.xInches * METERS_PER_INCH
  const dLat = ((-southM / EARTH_RADIUS_M) * 180) / Math.PI
  const dLng = ((eastM / (EARTH_RADIUS_M * Math.cos(latRad))) * 180) / Math.PI
  return { lat: origin.lat + dLat, lng: origin.lng + dLng }
}

/** Physical size of a satellite image in editor inches. */
export function imageSizeInches(
  lat: number,
  zoom: number,
  widthPx: number,
  heightPx: number,
  scale: 1 | 2 = 2
): { widthInches: number; heightInches: number } {
  // widthPx/heightPx are the *requested* Static Maps dimensions; with scale=2
  // the returned bitmap has twice the pixels covering the same ground, which
  // is why ground size uses scale=1 resolution for the requested size.
  const perPx = inchesPerPixel(lat, zoom, 1)
  return { widthInches: widthPx * perPx, heightInches: heightPx * perPx }
}
