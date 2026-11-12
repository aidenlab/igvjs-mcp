import { ALIGNMENT_PARTS, TRACK_PARTS, VARIANT_PARTS, type PartsAsk } from './protocol.ts'
import { aTrack, byWithTag, either, listed, type ByChange, type TrackTool } from './trackTools.ts'

export type { PartsAsk }

/** The parts `asked` gives, in TRACK_PARTS's order. */
function given(asked: PartsAsk, parts: readonly (keyof PartsAsk)[] = TRACK_PARTS): Array<keyof PartsAsk> {
  return parts.filter((part) => asked[part] !== undefined)
}

/**
 * The parts of a call, checked. Pure. Before any track is looked at: no part, parts no one
 * track has, or a track left nothing to draw is an error whatever tracks it is for.
 */
export function partsAsked(asked: PartsAsk): PartsAsk {
  const parts = given(asked)
  if (parts.length === 0) throw new Error(`Give ${either(TRACK_PARTS)}, or several of them.`)
  const [variantPart] = given(asked, VARIANT_PARTS)
  const [alignmentPart] = given(asked, ALIGNMENT_PARTS)
  if (variantPart && alignmentPart) {
    throw new Error(`${variantPart} is a part of variant tracks, ${alignmentPart} of alignment tracks: no track has both. Show or hide them in two calls.`)
  }
  if (asked.showCoverage === false && asked.showAlignments === false) {
    throw new Error('Hiding both the coverage and the alignments leaves the track nothing to draw: to take it away, use remove_track.')
  }
  return Object.fromEntries(parts.map((part) => [part, asked[part]]))
}

/**
 * What the live track knows of its parts that its Session summary may not give: for an
 * alignment track, whether its reads are paired, undefined until they load, how they are
 * grouped, as igv.js keys it, and whether its coverage and alignments are shown; for a variant
 * track, how many samples its file has, undefined until its header is read.
 */
export interface LiveParts {
  pairs?: boolean
  groupBy?: string
  showCoverage?: boolean
  showAlignments?: boolean
  samples?: number
}

/**
 * The one grouping igv.js means to view as pairs (`pairCompatibleGroupOptions`). Its own menu
 * looks for the grouping on the track, not its reads, so never finds one to refuse.
 */
const PAIR_GROUPING = 'firstOfPairStrand'

/** The other of coverage and alignments, and what each is called in an error. */
const DRAWN = {
  showCoverage: { other: 'showAlignments', what: 'coverage' },
  showAlignments: { other: 'showCoverage', what: 'alignments' },
} as const

/** Why hiding coverage or alignments would leave `name` nothing to draw, or undefined. */
function nothingDrawn(asked: PartsAsk, name: string, facts: LiveParts): string | undefined {
  for (const part of ['showCoverage', 'showAlignments'] as const) {
    const { other, what } = DRAWN[part]
    if (asked[part] === false && asked[other] === undefined && facts[other] === false) {
      return `"${name}" has its ${DRAWN[other].what} hidden, so hiding its ${what} too would leave it nothing to draw: give ${other} true with it.`
    }
  }
  return undefined
}

/** Why `name`'s reads cannot be viewed as pairs, as `asked` asks, or undefined. */
function noPairs(asked: PartsAsk, name: string, { pairs, groupBy }: LiveParts): string | undefined {
  if (asked.viewAsPairs !== true) return undefined
  if (pairs === false) return `"${name}" has no paired reads to view as pairs.`
  if (groupBy !== undefined && groupBy !== PAIR_GROUPING) {
    const grouping = groupBy.startsWith('tag:') ? byWithTag({ by: 'tag', tag: groupBy.slice(4) }) : groupBy
    return `"${name}" has its reads grouped by ${grouping}, which igv.js cannot view as pairs: only reads grouped by ${PAIR_GROUPING}, or not grouped, can be. Ungroup them with group_reads first.`
  }
  return undefined
}

/**
 * show_track_parts as a track tool: alignment tracks for their parts, variant tracks with
 * samples for their genotypes, as igv.js's own menus offer them. Pure. `live` gives what the
 * live track at an index knows of its parts.
 */
export function partsTool(asked: PartsAsk, live: (index: number) => LiveParts): TrackTool {
  const parts = given(asked)
  const variant = given(asked, VARIANT_PARTS).length > 0
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no parts to show or hide.'
      if (type !== 'alignment' && type !== 'variant') return `"${name}" is ${aTrack(type)}, which has no parts to show or hide: only alignment and variant tracks have them.`
      const facts = live(index)
      if (type === 'variant') {
        if (!variant) return `"${name}" is a variant track, which has no ${parts[0]}: its one part is ${VARIANT_PARTS[0]}.`
        if (facts.samples === 0) return `"${name}" has no genotypes to show or hide: its file has no samples.`
        return undefined
      }
      if (variant) return `"${name}" is an alignment track, which has no ${parts[0]}: its parts are ${either(ALIGNMENT_PARTS, 'and')}.`
      return noPairs(asked, name, facts) ?? nothingDrawn(asked, name, facts)
    },
    none: variant
      ? `No track can show or hide ${either(parts, 'and')}: only variant tracks with samples have it.`
      : `No track can show or hide ${either(parts, 'and')}: only alignment tracks have them.`,
  }
}

/** Each part as a note gives it shown or hidden, after "its" or "their". */
const SAID: Readonly<Record<keyof PartsAsk, string>> = {
  showCoverage: 'coverage',
  showAlignments: 'alignments',
  viewAsPairs: 'reads',
  showMismatches: 'mismatches',
  showSoftClips: 'soft clips',
  showInsertions: 'insertions',
  showGenotypes: 'genotypes',
}

/** "coverage hidden", "reads viewed as pairs". */
function partSaid(part: keyof PartsAsk, shown: boolean): string {
  if (part === 'viewAsPairs') return `reads ${shown ? '' : 'not '}viewed as pairs`
  return `${SAID[part]} ${shown ? 'shown' : 'hidden'}`
}

/** The note for a reply when every track already had the parts as asked, so nothing changed (ADR 0006). Pure. Undefined otherwise. */
export function partsNote(asked: PartsAsk, changes: ByChange[]): string | undefined {
  if (changes.length === 0 || !changes.every(({ unchanged }) => unchanged)) return undefined
  const its = changes.length === 1 ? 'its' : 'their'
  const parts = given(asked).map((part) => `${its} ${partSaid(part, asked[part]!)}`)
  return `${listed(changes.map(({ name }) => name))} already had ${either(parts, 'and')}, so nothing changed.`
}
