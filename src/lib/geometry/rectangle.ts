// Geometry helpers. Internal unit: inches.
// Output unit conventions:
//   area     -> square feet
//   perimeter / length -> linear feet
//   gallons  -> US gallons

const INCHES_PER_FOOT = 12
const SQ_INCHES_PER_SQ_FOOT = 144
const GALLONS_PER_CUBIC_FOOT = 7.48052

export function rectangleAreaSqft(widthInches: number, heightInches: number): number {
  return (widthInches * heightInches) / SQ_INCHES_PER_SQ_FOOT
}

export function rectanglePerimeterLf(widthInches: number, heightInches: number): number {
  return (2 * (widthInches + heightInches)) / INCHES_PER_FOOT
}

export function lengthFt(inches: number): number {
  return inches / INCHES_PER_FOOT
}

export function poolGallons(areaSqft: number, avgDepthFt: number): number {
  return areaSqft * avgDepthFt * GALLONS_PER_CUBIC_FOOT
}

// Wetted area = surface area + (perimeter × average depth). Approximation.
export function wettedAreaSqft(
  areaSqft: number,
  perimeterLf: number,
  avgDepthFt: number,
): number {
  return areaSqft + perimeterLf * avgDepthFt
}

// Resize a rectangle to a target surface area while preserving aspect ratio.
export function resizeToTargetArea(
  widthInches: number,
  heightInches: number,
  targetSqft: number,
): { widthInches: number; heightInches: number } {
  const currentArea = rectangleAreaSqft(widthInches, heightInches)
  if (currentArea <= 0) return { widthInches, heightInches }
  const scale = Math.sqrt(targetSqft / currentArea)
  return {
    widthInches: widthInches * scale,
    heightInches: heightInches * scale,
  }
}
