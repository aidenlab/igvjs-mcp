import { COLOR_BY } from './protocol.ts'
import { COLORED_TYPES } from './trackColor.ts'
import { aTrack, byWithTag, checkOneOf, checkReadTag, either, listed, type ByAsk, type ByChange, type LiveTrack, type TrackTool } from './trackTools.ts'

/** What a set_color_by call asks for: a way of coloring, and the tag or INFO field where it needs one. */
export type ColorByAsk = ByAsk

/** What a tag names, for each way of coloring that takes one. */
const TAGGED: Readonly<Record<string, string>> = {
  tag: 'the read tag to color by, such as HP',
  info: 'the INFO field to color by, such as AF',
}

/**
 * The color-by of a call, checked. Pure. Before any track is looked at: a way of coloring no
 * Track type offers, or a tag missing or out of place, is an error whatever tracks it is for.
 */
export function colorByAsked({ by, tag }: ColorByAsk): ColorByAsk {
  checkOneOf('color-by', by, COLOR_BY)
  const tagged = Object.hasOwn(TAGGED, by)
  if (tagged && !tag) throw new Error(`Color-by ${by} needs a tag: ${TAGGED[by]}.`)
  if (!tagged && tag !== undefined) throw new Error(`A tag goes only with color-by tag or info, not ${by}.`)
  if (by === 'tag') checkReadTag(tag!)
  return tagged ? { by, tag } : { by }
}

/** The ways of coloring igv.js's menu offers on each kind of track, in the menu's order. */
const OFFERED = {
  alignment: ['none', 'strand', 'firstOfPairStrand', 'pairOrientation', 'tlen', 'unexpectedPair', 'tag'],
  variant: ['none', 'info'],
  snp: ['function', 'class'],
} as const satisfies Record<string, readonly string[]>

/** Those of an alignment track that igv.js's menu offers only on paired reads. */
const PAIR_COLOR_BY: readonly string[] = ['firstOfPairStrand', 'pairOrientation', 'tlen', 'unexpectedPair']

/** The tracks named as the errors name them, by kind. */
const KIND_NAMES: Readonly<Record<keyof typeof OFFERED, string>> = { alignment: 'alignment', variant: 'variant', snp: 'SNP annotation' }

/** Where a track without a color-by gets its color, if igv.js gives it one. */
function colorElsewhere(type: string): string {
  return COLORED_TYPES.has(type) ? ' Its color is set by set_track_color.' : ''
}

/**
 * set_color_by as a track tool: the tracks that offer `asked`, as igv.js's own menus do. Pure.
 * `live` gives what the live track at an index knows.
 */
export function colorByTool({ by, tag }: ColorByAsk, live: (index: number) => LiveTrack): TrackTool {
  const offering = (Object.keys(OFFERED) as Array<keyof typeof OFFERED>).filter((kind) => (OFFERED[kind] as readonly string[]).includes(by))
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no color-by.'
      if (type === 'wig') return `"${name}" is a wig track, which has no color-by: its color is set by set_track_color.`
      const facts = live(index)
      if (type === 'annotation' && facts.igvType !== 'snp') {
        return `"${name}" is an annotation track, which has no color-by: only an SNP annotation track has one.${colorElsewhere(type)}`
      }
      const kind = type === 'annotation' ? 'snp' : type
      if (!Object.hasOwn(OFFERED, kind)) return `"${name}" is ${aTrack(type)}, which has no color-by: only alignment, variant and SNP annotation tracks have one.${colorElsewhere(type)}`
      const offered: readonly string[] = OFFERED[kind as keyof typeof OFFERED]
      const what = kind === 'snp' ? 'an SNP annotation track' : aTrack(type)
      if (!offered.includes(by)) return `"${name}" is ${what}, which offers color-by ${either(offered, 'and')}, not ${by}.`
      if (kind === 'alignment' && facts.pairs === false && PAIR_COLOR_BY.includes(by)) {
        return `"${name}" has no paired reads, so offers color-by ${either(offered.filter((way) => !PAIR_COLOR_BY.includes(way)), 'and')}, not ${by}.`
      }
      if (by === 'info' && facts.infoFields !== undefined && !facts.infoFields.includes(tag!)) {
        if (facts.infoFields.length === 0) return `"${name}" has no INFO fields to color by.`
        return `"${name}" has no INFO field ${tag}: its INFO fields are ${either(facts.infoFields, 'and')}.`
      }
      return undefined
    },
    none: `No track offers color-by ${by}: only ${either(offering.map((kind) => KIND_NAMES[kind]), 'and')} tracks do.`,
  }
}

/** The note for a reply when every track already had the color-by asked, so nothing changed (ADR 0006). Pure. Undefined otherwise. */
export function colorByNote(asked: ColorByAsk, changes: ByChange[]): string | undefined {
  if (changes.length === 0 || !changes.every(({ unchanged }) => unchanged)) return undefined
  return `${listed(changes.map(({ name }) => name))} already had color-by ${byWithTag(asked)}, so nothing changed.`
}
