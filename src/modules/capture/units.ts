// The one place metres become inches.
//
// ARKit works in metres. Pool Forge works in canvas inches for position and in
// feet for height, and has done since the first stencil was drawn. A capture
// crossing that line is the only moment the two systems meet, so the conversion
// lives here and nowhere else: every other module in `src/modules/capture/`
// takes its numbers already converted, or hands metres to one of these three
// functions and never does the arithmetic itself.
//
// Scattered conversion is how a survey ends up 3.28 times too big. There is a
// test pinning each constant to a value a person can check by hand, and a test
// asserting that no other file in the capture module contains the number 39.37
// or 3.28.

/** Exact by definition: one inch is 25.4 millimetres. */
export const INCHES_PER_METRE = 1 / 0.0254

/** Exact: twelve inches to the foot, so this follows from the inch. */
export const FEET_PER_METRE = INCHES_PER_METRE / 12

/** Position: metres in the capture frame to canvas inches. */
export function metresToInches(metres: number): number {
  return metres * INCHES_PER_METRE
}

/** Height: metres of ARKit elevation to the feet the grade model speaks. */
export function metresToFeet(metres: number): number {
  return metres * FEET_PER_METRE
}
