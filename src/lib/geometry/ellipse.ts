// Ellipse (oval / roman-end style) pool geometry from a bounding box.
// Width / height in inches; area -> square feet, perimeter -> linear feet.

const SQ_INCHES_PER_SQ_FOOT = 144
const INCHES_PER_FOOT = 12

export function ellipseAreaSqft(widthInches: number, heightInches: number): number {
  const a = widthInches / 2
  const b = heightInches / 2
  return (Math.PI * a * b) / SQ_INCHES_PER_SQ_FOOT
}

/** Ramanujan's approximation of the ellipse circumference. Exact for a circle. */
export function ellipsePerimeterLf(widthInches: number, heightInches: number): number {
  const a = widthInches / 2
  const b = heightInches / 2
  if (a + b === 0) return 0
  const h = (a - b) ** 2 / (a + b) ** 2
  const circumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  return circumference / INCHES_PER_FOOT
}
