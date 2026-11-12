import { DISPLAY_MODES } from './protocol.ts'
import { aTrack, checkOneOf, either, listed, type TrackTool } from './trackTools.ts'

/**
 * The display modes each Track type's menu offers in igv.js, in the menu's order. A seg track
 * of mutations, which igv.js names mut (maf folds into it), offers no fill.
 */
const OFFERED: Readonly<Record<string, readonly string[]>> = {
  annotation: ['collapsed', 'squished', 'expanded'],
  variant: ['collapsed', 'squished', 'expanded'],
  alignment: ['expanded', 'squished', 'full'],
  seg: ['squished', 'expanded', 'fill'],
}
const MUTATION_MODES: readonly string[] = ['squished', 'expanded']

/** The Track types with a display mode, as the Session summary names them. */
const WITH_DISPLAY_MODE = Object.keys(OFFERED)

/**
 * The display mode of a call, checked. Pure. Before any track is looked at: a mode
 * no Track type offers is an error whatever tracks it is for.
 */
export function displayModeAsked(mode: string): string {
  checkOneOf('display mode', mode, DISPLAY_MODES)
  return mode
}

/**
 * set_display_mode as a track tool: the tracks whose Track type offers `mode`, as igv.js's own
 * menus do. Pure. `igvType` gives igv.js's own name for the Track type of the track at an index,
 * which tells a seg track of mutations from seg proper.
 */
export function displayModeTool(mode: string, igvType: (index: number) => string | undefined): TrackTool {
  const offering = WITH_DISPLAY_MODE.filter((type) => OFFERED[type].includes(mode))
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no display mode.'
      if (type === 'wig') return `"${name}" is a wig track, which has no display mode: how it is drawn is set by set_signal_style's graphType.`
      if (!Object.hasOwn(OFFERED, type)) return `"${name}" is ${aTrack(type)}, which has no display mode: only ${either(WITH_DISPLAY_MODE, 'and')} tracks have one.`
      const mutations = type === 'seg' && igvType(index) === 'mut'
      const offered = mutations ? MUTATION_MODES : OFFERED[type]
      if (offered.includes(mode)) return undefined
      return `"${name}" is ${mutations ? 'a seg track of mutations' : aTrack(type)}, which offers display modes ${either(offered, 'and')}, not ${mode}.`
    },
    none: `No track offers display mode ${mode}: only ${either(offering, 'and')} tracks do.`,
  }
}

/** What a display mode change did to one track, named as the Session summary names it. */
export interface DisplayModeChange {
  name: string
  /** True when the track already had the mode. */
  unchanged: boolean
}

/** The note for a reply when every track already had `mode`, so nothing changed (ADR 0006). Pure. Undefined otherwise. */
export function displayModeNote(mode: string, changes: DisplayModeChange[]): string | undefined {
  if (changes.length === 0 || !changes.every(({ unchanged }) => unchanged)) return undefined
  return `${listed(changes.map(({ name }) => name))} already had display mode ${mode}, so nothing changed.`
}
