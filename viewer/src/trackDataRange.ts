import { aTrack, listed, type TrackTool } from './trackTools.ts'

/** What one set_data_range call asks for: a fixed range, or one bound of it, autoscale, log scale, or several. */
export interface DataRangeAsk {
  min?: number
  max?: number
  autoscale?: boolean
  logScale?: boolean
}

function checkBound(name: 'min' | 'max', bound: number | undefined): void {
  if (bound !== undefined && !Number.isFinite(bound)) throw new Error(`${name} must be a number, not ${bound}.`)
}

/**
 * The data range of a call, checked. Pure. Before any track is looked at: a
 * range that is an error is one whatever tracks it is for.
 */
export function dataRangeAsked({ min, max, autoscale, logScale }: DataRangeAsk): DataRangeAsk {
  if (min === undefined && max === undefined && autoscale === undefined && logScale === undefined) {
    throw new Error('Give min and max, autoscale, logScale, or several of them.')
  }
  checkBound('min', min)
  checkBound('max', max)
  if (min !== undefined && max !== undefined && !(min < max)) throw new Error(`min must be below max: ${min} is not below ${max}.`)
  if (autoscale === true && (min !== undefined || max !== undefined)) {
    throw new Error('Give a fixed min and max or autoscale: true, not both: autoscale sets the range itself.')
  }
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(autoscale !== undefined ? { autoscale } : {}),
    ...(logScale !== undefined ? { logScale } : {}),
  }
}

/**
 * The Track types igv.js's menu offers "Set data range" and "Autoscale" on, as canonical
 * names: an alignment track's are its coverage's. An interact track has them only while its
 * arcs are proportional. shoebox, cnvpytor and merged tracks have a range of their own that
 * igv-bot leaves to igv.js's menu.
 */
const RANGED_TYPES: ReadonlySet<string> = new Set(['wig', 'alignment', 'qtl', 'gwas', 'gcnv', 'interact'])

/** The Track types igv.js gives a log scale (`logScale` defined): its "Log scale" item. */
const LOG_SCALED_TYPES: ReadonlySet<string> = new Set(['wig', 'interact'])

const ONLY_LOG_SCALED = 'only wig and interact tracks have one.'

/** What the Viewer knows of a live track that its Session summary does not give. */
export interface LiveDrawing {
  /** A wig track drawn as a heatmap. */
  heatmap: boolean
  /** An interact track whose arcs are nested, not proportional. */
  nestedArcs: boolean
}

/**
 * set_data_range as a track tool: the tracks that take every part of `asked`, as igv.js's
 * own menu offers them. Pure. `drawing` gives how the track at an index is drawn.
 */
export function dataRangeTool(asked: DataRangeAsk, drawing: (index: number) => LiveDrawing): TrackTool {
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no data range.'
      if (!RANGED_TYPES.has(type)) {
        return `"${name}" is ${aTrack(type)}, which has no data range${['shoebox', 'cnvpytor', 'merged'].includes(type) ? ' igv-bot sets' : ''}.`
      }
      const { heatmap, nestedArcs } = drawing(index)
      if (heatmap) return `"${name}" is drawn as a heatmap, whose range is set by set_signal_style's colorScale.`
      if (nestedArcs) return `"${name}" draws its arcs nested, which have no data range: set_arcs can draw them proportional.`
      if (asked.logScale !== undefined && !LOG_SCALED_TYPES.has(type)) {
        return `"${name}" is ${aTrack(type)}, ${type === 'alignment' ? 'whose coverage' : 'which'} has no log scale: ${ONLY_LOG_SCALED}`
      }
      return undefined
    },
    none: asked.logScale !== undefined ? `No track has a log scale: ${ONLY_LOG_SCALED}` : 'No track has a data range.',
  }
}

/** A data range as igv.js keeps one. */
export interface DataRange {
  min: number
  max: number
}

/**
 * The fixed range `asked` gives the track named `name`, whose range is `current`, or none
 * when it asks for no fixed range. Pure. A bound not given is the track's own, as igv.js's
 * "Set data range" dialog fills it in; autoscale turned off keeps the range the track has.
 */
export function fixedRange({ min, max, autoscale }: DataRangeAsk, name: string, current: DataRange | undefined): DataRange | undefined {
  if (min === undefined && max === undefined && autoscale !== false) return undefined
  if (!current && (min === undefined || max === undefined)) throw new Error(`"${name}" has no data range yet: give both min and max.`)
  const range = { min: min ?? current!.min, max: max ?? current!.max }
  if (!(range.min < range.max)) throw new Error(`min must be below max: "${name}" would range from ${range.min} to ${range.max}.`)
  return range
}

/** What a data range change did to one track, named as the Session summary names it. */
export interface DataRangeChange {
  name: string
  /** True when the track already had everything asked for. */
  unchanged: boolean
  /** The autoscale group a person made that the change took the track out of, and the tracks still in it. */
  group?: { id: string; stillIn: string[] }
}

function onOff(on: boolean): string {
  return on ? 'on' : 'off'
}

/** What `asked` asks for, in words: "a data range of 0 to 10 and log scale on". */
function described({ min, max, autoscale, logScale }: DataRangeAsk): string {
  const parts: string[] = []
  if (min !== undefined && max !== undefined) parts.push(`a data range of ${min} to ${max}`)
  else if (min !== undefined) parts.push(`a min of ${min}`)
  else if (max !== undefined) parts.push(`a max of ${max}`)
  if (autoscale !== undefined) parts.push(`autoscale ${onOff(autoscale)}`)
  if (logScale !== undefined) parts.push(`log scale ${onOff(logScale)}`)
  return parts.join(' and ')
}

/** The sentence on the tracks taken out of one autoscale group. */
function groupSentence(names: string[], stillIn: string[]): string {
  const one = names.length === 1
  const left = `${listed(names)} ${one ? 'was' : 'were'} taken out of ${one ? 'its' : 'their'} autoscale group`
  return stillIn.length === 0 ? `${left}.` : `${left}; ${listed(stillIn)} ${stillIn.length === 1 ? 'is' : 'are'} still in it.`
}

/**
 * The note for a reply when a data range was set other than as asked (ADR 0006): tracks
 * taken out of an autoscale group a person made, or every track already had what was
 * asked, so nothing changed. Pure. Undefined when every track took it as asked.
 */
export function dataRangeNote(asked: DataRangeAsk, changes: DataRangeChange[]): string | undefined {
  if (changes.length > 0 && changes.every(({ unchanged }) => unchanged)) {
    return `${listed(changes.map(({ name }) => name))} already had ${described(asked)}, so nothing changed.`
  }
  const groups = new Map<string, { names: string[]; stillIn: string[] }>()
  for (const { name, group } of changes) {
    if (!group) continue
    const taken = groups.get(group.id) ?? { names: [], stillIn: group.stillIn }
    taken.names.push(name)
    groups.set(group.id, taken)
  }
  const sentences = [...groups.values()].map(({ names, stillIn }) => groupSentence(names, stillIn))
  return sentences.length > 0 ? sentences.join(' ') : undefined
}
