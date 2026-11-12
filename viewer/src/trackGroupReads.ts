import { GROUP_BY } from './protocol.ts'
import { aTrack, byWithTag, checkOneOf, checkReadTag, either, listed, type ByAsk, type ByChange, type LiveTrack, type TrackTool } from './trackTools.ts'

/** What a group_reads call asks for: a way of grouping, and the read tag for tag. */
export type GroupReadsAsk = ByAsk

/** Those igv.js's "Group by" menu offers only on paired reads. */
const PAIR_GROUP_BY: readonly string[] = ['firstOfPairStrand', 'pairOrientation', 'mateChr']

/**
 * The grouping of a call, checked. Pure. Before any track is looked at: a way of grouping
 * igv.js does not offer, or a tag missing or out of place, is an error whatever tracks it is for.
 */
export function groupReadsAsked({ by, tag }: GroupReadsAsk): GroupReadsAsk {
  checkOneOf('grouping', by, GROUP_BY)
  if (by !== 'tag') {
    if (tag !== undefined) throw new Error(`A tag goes only with grouping by tag, not ${by}.`)
    return { by }
  }
  if (!tag) throw new Error('Grouping by tag needs a tag: the read tag to group by, such as RG.')
  checkReadTag(tag)
  return { by, tag }
}

/**
 * group_reads as a track tool: alignment tracks, as igv.js's own menu offers it. Pure. `live`
 * gives what the live track at an index knows: whether its reads are paired.
 */
export function groupReadsTool({ by }: GroupReadsAsk, live: (index: number) => LiveTrack): TrackTool {
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no reads to group.'
      if (type !== 'alignment') return `"${name}" is ${aTrack(type)}, which has no reads to group: only alignment tracks have them.`
      if (live(index).pairs === false && PAIR_GROUP_BY.includes(by)) {
        return `"${name}" has no paired reads, so its reads group by ${either(GROUP_BY.filter((way) => !PAIR_GROUP_BY.includes(way)), 'and')}, not ${by}.`
      }
      return undefined
    },
    none: 'No track has reads to group: only alignment tracks have them.',
  }
}

/** The note for a reply when every track already had the grouping asked, so nothing changed (ADR 0006). Pure. Undefined otherwise. */
export function groupReadsNote(asked: GroupReadsAsk, changes: ByChange[]): string | undefined {
  if (changes.length === 0 || !changes.every(({ unchanged }) => unchanged)) return undefined
  const grouping = asked.by === 'none' ? 'ungrouped' : `grouped by ${byWithTag(asked)}`
  return `${listed(changes.map(({ name }) => name))} already had ${changes.length === 1 ? 'its' : 'their'} reads ${grouping}, so nothing changed.`
}
