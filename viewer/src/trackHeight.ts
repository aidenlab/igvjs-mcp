import type { TrackHeight } from './protocol.ts'

/** A track is at least a pixel high, and at most what igv.js lets one be dragged to. */
const MIN_HEIGHT = 1
const MAX_HEIGHT = 1000

/** Two thirds of a height is rarely a whole number, and half as much again of that is the height it came from only to within rounding. */
function settled(height: number): number {
  const whole = Math.round(height)
  return Math.abs(height - whole) < 1e-9 ? whole : height
}

/**
 * The height of a track now `current` pixels high once `height` is applied.
 * Pure. "taller" is ×1.5 and "shorter" ×2/3, so that one undoes the other;
 * they stop at the limits. A number outside the limits is an error whose
 * message the model is given.
 */
export function changedHeight(current: number, height: TrackHeight): number {
  // A track a person set beyond a limit is not brought back to it by a change the other way.
  if (height === 'taller') return Math.max(current, Math.min(MAX_HEIGHT, settled(current * 1.5)))
  if (height === 'shorter') return Math.min(current, Math.max(MIN_HEIGHT, settled((current * 2) / 3)))
  if (typeof height !== 'number' || !(height >= MIN_HEIGHT && height <= MAX_HEIGHT)) {
    throw new Error(`A track cannot be ${height} pixels high. Give a height from ${MIN_HEIGHT} to ${MAX_HEIGHT} pixels, or "taller" or "shorter".`)
  }
  return height
}
