import type { TrackSelection, TrackSummary } from './protocol.ts'
import { addressTracks } from './trackAddress.ts'

/** "A", "A" and "B", "A", "B" and "C": names quoted, as notes and errors give them. */
export function listed(names: string[]): string {
  const quoted = names.map((name) => `"${name}"`)
  return quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
}

/** "a, b or c", or with `and`: "a, b and c". */
export function either(values: readonly string[], word = 'or'): string {
  return values.length === 1 ? values[0] : `${values.slice(0, -1).join(', ')} ${word} ${values[values.length - 1]}`
}

/** An error naming the legal values when `value`, a `what`, is none of them. */
export function checkOneOf(what: string, value: string | undefined, legal: readonly string[]): void {
  if (value !== undefined && !legal.includes(value)) throw new Error(`"${value}" is no ${what}: give ${either(legal)}.`)
}

/** "a seg track", "an alignment track". */
export function aTrack(type: string): string {
  return `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} track`
}

/** The Track types a track tool applies to, as two answers about a track of the Session summary. */
export interface TrackTool {
  /** Why the tool does not apply to `track`, as the error the model is given; undefined when it does. */
  refuse(track: TrackSummary, index: number): string | undefined
  /** The error when all is given and the tool applies to no track. */
  none: string
}

/** The tracks a track tool's call is for, as indexes into the Session summary's tracks, and why all passed over any others. */
export interface TrackTargets {
  targets: number[]
  /** Each a sentence on a track all passed over. The sequence track is never among them: no track tool applies to it. */
  passedOver: string[]
}

/**
 * The tracks of the Session summary that `selection` means for `tool` (ADR 0005).
 * Pure. A call is all or nothing: a track addressed by name or position that the
 * tool does not apply to is the error, and the call is for no track. all is every
 * track the tool applies to, passing over the others.
 */
export function trackTargets(tracks: TrackSummary[], selection: TrackSelection, tool: TrackTool): TrackTargets {
  const addressed = addressTracks(tracks, selection)
  const targets: number[] = []
  const passedOver: string[] = []
  for (const index of addressed) {
    const refusal = tool.refuse(tracks[index], index)
    if (refusal === undefined) targets.push(index)
    else if (!selection.all) throw new Error(refusal)
    // Passed over every time, so a word on it would be one the model learns to skip.
    else if (tracks[index].type !== 'sequence') passedOver.push(refusal)
  }
  if (targets.length === 0) throw new Error(tool.none)
  return { targets, passedOver }
}

/** The note when all passed over tracks the tool does not apply to (ADR 0006). Pure. Undefined when it passed over none. */
export function passedOverNote(passedOver: string[]): string | undefined {
  if (passedOver.length === 0) return undefined
  return `Passed over by all: ${passedOver.join(' ')}`
}

/** The notes of a reply as one, or none. */
export function joinedNotes(...notes: Array<string | undefined>): string | undefined {
  const given = notes.filter((note): note is string => note !== undefined)
  return given.length > 0 ? given.join(' ') : undefined
}

/**
 * What the live track knows that its Session summary does not: igv.js's own name for its
 * Track type, which tells an SNP track from other annotation tracks; for an alignment track,
 * whether its reads are paired, undefined until they load; for a variant track, the INFO
 * fields its file declares, undefined until its header is read.
 */
export interface LiveTrack {
  igvType?: string
  pairs?: boolean
  infoFields?: string[]
}

/** What a color-by or grouping call asks for: a way of coloring or grouping, and the tag or INFO field where it needs one. */
export interface ByAsk {
  by: string
  tag?: string
}

/** "strand", "tag HP": a way of coloring or grouping, with its tag. */
export function byWithTag({ by, tag }: ByAsk): string {
  return tag === undefined ? by : `${by} ${tag}`
}

/** A read tag as SAM spells them: two characters, a letter then a letter or digit. */
const READ_TAG = /^[A-Za-z][A-Za-z0-9]$/

/** An error unless `tag`, given with group or color-by tag, is a read tag. */
export function checkReadTag(tag: string): void {
  if (!READ_TAG.test(tag)) throw new Error(`"${tag}" is no read tag: a read tag is two characters, a letter then a letter or digit, such as HP.`)
}

/** What a color-by or grouping change did to one track, named as the Session summary names it. */
export interface ByChange {
  name: string
  /** True when the track already had it. */
  unchanged: boolean
}
