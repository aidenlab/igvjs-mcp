import { ARC_OPTIONS, ARC_ORIENTATIONS, ARC_TYPES, type ArcsAsk } from './protocol.ts'
import { aTrack, checkOneOf, either, listed, type ByChange, type TrackTool } from './trackTools.ts'

export type { ArcsAsk }

/** The options `asked` gives, in ARC_OPTIONS's order. */
function given(asked: ArcsAsk): Array<keyof ArcsAsk> {
  return ARC_OPTIONS.filter((option) => asked[option] !== undefined)
}

/**
 * The arcs of a call, checked. Pure. Before any track is looked at: arcs that are an error
 * are one whatever tracks they are for. The bounds are igv.js's own menu's: a thickness it
 * draws, and an alpha from 0 to 1.
 */
export function arcsAsked(asked: ArcsAsk): ArcsAsk {
  const options = given(asked)
  if (options.length === 0) throw new Error(`Give ${either(ARC_OPTIONS)}, or several of them.`)
  checkOneOf('arc type', asked.arcType, ARC_TYPES)
  checkOneOf('arc orientation', asked.arcOrientation, ARC_ORIENTATIONS)
  const { thickness, alpha } = asked
  // igv.js draws a thickness of 0 as 1.
  if (thickness !== undefined && !(Number.isFinite(thickness) && thickness > 0)) {
    throw new Error(`${thickness} is no thickness: give a number of pixels above 0.`)
  }
  if (alpha !== undefined && !(alpha >= 0 && alpha <= 1)) throw new Error(`${alpha} is no alpha: give a number from 0, clear, to 1, opaque.`)
  return Object.fromEntries(options.map((option) => [option, asked[option]]))
}

/**
 * What the live interact track knows that its Session summary does not: whether it is read
 * from a .hic file, and whether its features have scores, undefined until they load.
 */
export interface LiveArcs {
  hic: boolean
  scored?: boolean
}

/** The arcs igv.js's menu offers on an interact track read from a .hic file, which it shades by score itself. */
const HIC_ARC_OPTIONS: ReadonlyArray<keyof ArcsAsk> = ['arcOrientation', 'thickness']

/** Why the arcs `asked` cannot be given to `name`, an interact track, as `live` has it, or undefined. */
function noArcs(asked: ArcsAsk, name: string, { hic, scored }: LiveArcs): string | undefined {
  if (hic) {
    const offered = given(asked).filter((option) => !HIC_ARC_OPTIONS.includes(option))
    if (offered.length > 0) return `"${name}" is read from a .hic file, whose arcs igv.js shades by their scores itself: it takes only ${either(HIC_ARC_OPTIONS, 'and')}, not ${either(offered, 'and')}.`
    return undefined
  }
  // As igv.js's menu, which offers arc types and useScore only once it has seen scores.
  if (scored === false) {
    if (asked.arcType !== undefined && asked.arcType !== 'nested') return `"${name}" has no scores, which ${asked.arcType} arcs are drawn to the height of: its arcs can only be nested.`
    if (asked.useScore === true) return `"${name}" has no scores to shade its arcs by.`
  }
  return undefined
}

/** set_arcs as a track tool: interact tracks, as igv.js's own menu offers each option. Pure. `live` gives what the live track at an index knows. */
export function arcsTool(asked: ArcsAsk, live: (index: number) => LiveArcs): TrackTool {
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no arcs.'
      if (type !== 'interact') return `"${name}" is ${aTrack(type)}, which has no arcs: only interact tracks have them.`
      return noArcs(asked, name, live(index))
    },
    none: 'No track has arcs: only interact tracks do.',
  }
}

/** "arc type proportional", "arcs not shaded by score": one option of `asked` as a note gives it. */
function arcSaid(option: keyof ArcsAsk, asked: ArcsAsk): string {
  switch (option) {
    case 'arcType':
      return `arc type ${asked.arcType}`
    case 'arcOrientation':
      return `arcs drawn ${asked.arcOrientation}`
    case 'useScore':
      return `arcs ${asked.useScore ? '' : 'not '}shaded by score`
    default:
      return `${option} ${asked[option]}`
  }
}

/** The note for a reply when every track already had the arcs as asked, so nothing changed (ADR 0006). Pure. Undefined otherwise. */
export function arcsNote(asked: ArcsAsk, changes: ByChange[]): string | undefined {
  if (changes.length === 0 || !changes.every(({ unchanged }) => unchanged)) return undefined
  const arcs = given(asked).map((option) => arcSaid(option, asked))
  return `${listed(changes.map(({ name }) => name))} already had ${either(arcs, 'and')}, so nothing changed.`
}
