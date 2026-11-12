import type { TrackHeight } from './protocol.ts'
import { listed } from './trackTools.ts'

/** A track is at least a pixel high, and at most what igv.js lets one be dragged to. */
const MIN_HEIGHT = 1
const MAX_HEIGHT = 1000

/** Two thirds of a height is rarely a whole number, and half as much again of that is the height it came from only to within rounding. */
function wholePixelIfWithinRounding(height: number): number {
  const whole = Math.round(height)
  return Math.abs(height - whole) < 1e-9 ? whole : height
}

/**
 * Whether `asked` is a height a track can be given. Pure. One that is not, such
 * as a number outside the limits, is an error whose message the model is given.
 */
export function checkHeight(asked: TrackHeight): void {
  if (asked === 'taller' || asked === 'shorter') return
  if (typeof asked !== 'number' || !(asked >= MIN_HEIGHT && asked <= MAX_HEIGHT)) {
    throw new Error(`A track cannot be ${asked} pixels high. Give a height from ${MIN_HEIGHT} to ${MAX_HEIGHT} pixels, or "taller" or "shorter".`)
  }
}

/**
 * The height of a track now `current` pixels high once it is given the height
 * `asked`. Pure. "taller" is ×1.5 and "shorter" ×2/3, so that one undoes the
 * other; they stop at the limits.
 */
export function changedHeight(current: number, asked: TrackHeight): number {
  checkHeight(asked)
  // A track a person set beyond a limit is not brought back to it by a change the other way.
  if (asked === 'taller') return Math.max(current, Math.min(MAX_HEIGHT, scaled(current, asked)))
  if (asked === 'shorter') return Math.min(current, Math.max(MIN_HEIGHT, scaled(current, asked)))
  return asked
}

/** "taller" or "shorter" of a track `current` pixels high, before the limits. */
function scaled(current: number, asked: 'taller' | 'shorter'): number {
  return wholePixelIfWithinRounding(asked === 'taller' ? current * 1.5 : (current * 2) / 3)
}

/** What a height change did to one track, named as the Session summary names it. */
export interface HeightChange {
  name: string
  from: number
  to: number
}

function pixels(height: number): string {
  return `${height} pixel${height === 1 ? '' : 's'}`
}

/**
 * The note for a reply when the height `asked` was carried out other than as
 * asked (ADR 0006): "taller" or "shorter" stopped at a limit, or every track
 * already had the height, so nothing changed. Pure. Undefined when every track
 * got the height asked for.
 */
export function heightNote(asked: TrackHeight, changes: HeightChange[]): string | undefined {
  if (typeof asked === 'number') {
    if (changes.length === 0 || changes.some(({ from, to }) => from !== to)) return undefined
    const were = changes.length === 1 ? 'was' : 'were'
    return `${listed(changes.map(({ name }) => name))} ${were} already ${pixels(asked)} high, so nothing changed.`
  }
  const limit = asked === 'taller' ? MAX_HEIGHT : MIN_HEIGHT
  const limited = changes.filter(({ from, to }) => to !== scaled(from, asked))
  // A track that moved stopped at the limit; one already at it, or beyond it as a person may set one, did not move.
  const stopped = limited.filter(({ from, to }) => to !== from)
  const left = limited.filter(({ from, to }) => to === from)
  const notes = [
    ...(stopped.length > 0 ? [`${listed(stopped.map(({ name }) => name))} stopped at ${pixels(limit)}: no track is made ${asked} than that.`] : []),
    ...left.map(({ name, from }) => `"${name}" was left at ${pixels(from)}: no track is made ${asked} than ${limit}.`),
  ]
  return notes.length > 0 ? notes.join(' ') : undefined
}
