export const INCHES_PER_FOOT = 12

export const feet = (inches: number): number => inches / INCHES_PER_FOOT
export const inches = (feet: number): number => feet * INCHES_PER_FOOT
