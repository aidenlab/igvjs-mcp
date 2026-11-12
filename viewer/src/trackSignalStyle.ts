import { COLOR_SCALE_TYPES, GRAPH_TYPES, WINDOW_FUNCTIONS, type ColorScaleAsk } from './protocol.ts'
import { sameColor, trackColor, UNSET } from './trackColor.ts'
import { aTrack, checkOneOf, either, listed, type TrackTool } from './trackTools.ts'

/** The graph type igv.js draws a wig track with when it is given none. */
export const DEFAULT_GRAPH_TYPE = 'bar'

/** What one set_signal_style call asks for. */
export interface SignalStyleAsk {
  graphType?: string
  windowFunction?: string
  flipAxis?: boolean
  colorScale?: ColorScaleAsk
}

const BOUNDS = ['min', 'mid', 'max'] as const
const COLORS = ['minColor', 'midColor', 'maxColor'] as const

function colorScaleAsked(asked: ColorScaleAsk): ColorScaleAsk {
  const { type } = asked
  if (BOUNDS.every((bound) => asked[bound] === undefined) && COLORS.every((color) => asked[color] === undefined)) {
    throw new Error('Give the colorScale a min, max, mid, minColor, midColor or maxColor.')
  }
  checkOneOf('color scale type', type, COLOR_SCALE_TYPES)
  const checked: ColorScaleAsk = type !== undefined ? { type } : {}
  for (const bound of BOUNDS) {
    const value = asked[bound]
    if (value === undefined) continue
    if (!Number.isFinite(value)) throw new Error(`The colorScale ${bound} must be a number, not ${value}.`)
    checked[bound] = value
  }
  const { min, mid, max } = checked
  if (min !== undefined && max !== undefined && !(min < max)) throw new Error(`The colorScale min must be below its max: ${min} is not below ${max}.`)
  if (mid !== undefined && min !== undefined && max !== undefined && !(min < mid && mid < max)) {
    throw new Error(`The colorScale mid must lie between its min and max: ${mid} is outside ${min} to ${max}.`)
  }
  if (mid !== undefined && min !== undefined && !(min < mid)) throw new Error(`The colorScale mid must lie between its min and max: ${min} is not below ${mid}.`)
  if (mid !== undefined && max !== undefined && !(mid < max)) throw new Error(`The colorScale mid must lie between its min and max: ${mid} is not below ${max}.`)
  for (const option of COLORS) {
    const color = asked[option]
    if (color === undefined) continue
    if (color.trim().toLowerCase() === UNSET) throw new Error(`"${color}" is no color for a colorScale: give one as "#RRGGBB" or "rgb(R, G, B)".`)
    checked[option] = trackColor(color)
  }
  return checked
}

/**
 * The signal style of a call, checked. Pure. Before any track is looked at: a
 * style that is an error is one whatever tracks it is for.
 */
export function signalStyleAsked({ graphType, windowFunction, flipAxis, colorScale }: SignalStyleAsk): SignalStyleAsk {
  if (graphType === undefined && windowFunction === undefined && flipAxis === undefined && colorScale === undefined) {
    throw new Error('Give a graphType, windowFunction, flipAxis, colorScale, or several of them.')
  }
  checkOneOf('graph type', graphType, GRAPH_TYPES)
  checkOneOf('window function', windowFunction, WINDOW_FUNCTIONS)
  if (graphType === 'heatmap' && flipAxis !== undefined) throw new Error('A heatmap has no axis to flip: leave flipAxis out, or give another graphType.')
  if (colorScale !== undefined && graphType !== undefined && graphType !== 'heatmap') {
    throw new Error('A colorScale is for tracks drawn as a heatmap: give graphType heatmap with it, or leave graphType out.')
  }
  return {
    ...(graphType !== undefined ? { graphType } : {}),
    ...(windowFunction !== undefined ? { windowFunction } : {}),
    ...(flipAxis !== undefined ? { flipAxis } : {}),
    ...(colorScale !== undefined ? { colorScale: colorScaleAsked(colorScale) } : {}),
  }
}

/** What the Viewer knows of a live wig track that its Session summary may not give. */
export interface LiveSignal {
  /** How the track is drawn, as igv.js has it. */
  graphType?: string
  /** The window functions its file offers, none when it gives one value for each place. */
  windowFunctions?: readonly string[]
}

const ONLY_WIG = 'only wig tracks have one.'

/**
 * set_signal_style as a track tool: the wig tracks that take every part of `asked`, as
 * igv.js's own menu offers them. Pure. `live` gives what the track at an index is drawn as
 * and offers. A color scale is only for a track drawn as a heatmap, or made one by the call.
 */
export function signalStyleTool(asked: SignalStyleAsk, live: (index: number) => LiveSignal): TrackTool {
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return 'The sequence track has no signal style.'
      if (type !== 'wig') return `"${name}" is ${aTrack(type)}, which has no signal style: ${ONLY_WIG}`
      const { graphType = DEFAULT_GRAPH_TYPE, windowFunctions = [] } = live(index)
      if (asked.flipAxis !== undefined && asked.graphType === undefined && graphType === 'heatmap') {
        return `"${name}" is drawn as a heatmap, which has no axis to flip: give another graphType with it to draw it with one.`
      }
      if (asked.colorScale !== undefined && asked.graphType === undefined && graphType !== 'heatmap') {
        return `"${name}" is drawn as ${graphType}, not as a heatmap, so it has no colorScale: give graphType heatmap with it to draw it as one.`
      }
      if (asked.windowFunction !== undefined && !windowFunctions.includes(asked.windowFunction)) {
        return windowFunctions.length === 0
          ? `"${name}" offers no window function: its file gives one value for each place.`
          : `"${name}" offers no window function ${asked.windowFunction}: its file offers ${either(windowFunctions, 'and')}.`
      }
      return undefined
    },
    none:
      asked.colorScale !== undefined && asked.graphType === undefined
        ? 'No track is drawn as a heatmap: give graphType heatmap with the colorScale to draw tracks as one.'
        : asked.windowFunction !== undefined
          ? `No track offers window function ${asked.windowFunction}.`
          : `No track has a signal style: ${ONLY_WIG}`,
  }
}

/** A color scale as igv.js saves one (`toJson`): a gradient, or diverging about a mid. */
export interface ColorScale {
  type: string
  min: number
  max: number
  minColor: string
  maxColor: string
  mid?: number
  midColor?: string
}

/** The colors igv.js gives a heatmap it has no color scale for (`ColorScaleFactory`). */
const DEFAULT_COLORS = { minColor: 'rgb(46,56,183)', midColor: 'white', maxColor: 'rgb(164,0,30)' }

/**
 * The color scale `asked` gives the track named `name`, whose scale is `current`, if it has
 * one. Pure. What is not given is kept as the track has it, or as igv.js would draw it; a
 * mid makes the scale diverging, as igv.js's "Set color scale" does.
 */
export function colorScaleFor(asked: ColorScaleAsk, name: string, current: Partial<ColorScale> | undefined): ColorScale {
  const was = current ?? {}
  const type = asked.type ?? (asked.mid !== undefined || asked.midColor !== undefined ? 'diverging' : was.type === 'diverging' ? 'diverging' : 'gradient')
  const min = asked.min ?? was.min
  const max = asked.max ?? was.max
  if (min === undefined || max === undefined) throw new Error(`"${name}" has no color scale yet: give the colorScale a min and max.`)
  if (!(min < max)) throw new Error(`The colorScale min must be below its max: "${name}" would range from ${min} to ${max}.`)
  const scale = {
    type,
    min,
    max,
    minColor: asked.minColor ?? was.minColor ?? DEFAULT_COLORS.minColor,
    maxColor: asked.maxColor ?? was.maxColor ?? DEFAULT_COLORS.maxColor,
  }
  if (type === 'gradient') return scale

  const mid = asked.mid ?? (was.type === 'diverging' ? was.mid : undefined)
  if (mid === undefined) throw new Error('A diverging colorScale needs a mid: give one between its min and max.')
  if (!(min < mid && mid < max)) throw new Error(`The colorScale mid must lie between its min and max: "${name}" would have a mid of ${mid}, outside ${min} to ${max}.`)
  return { ...scale, mid, midColor: asked.midColor ?? was.midColor ?? DEFAULT_COLORS.midColor }
}

/** What a signal style change did to one track, named as the Session summary names it. */
export interface SignalStyleChange {
  name: string
  /** True when the track already had everything asked for. */
  unchanged: boolean
}

/** What `asked` asks for, in words: "graph type line and window function max". */
function described({ graphType, windowFunction, flipAxis, colorScale }: SignalStyleAsk): string {
  const parts: string[] = []
  if (graphType !== undefined) parts.push(`graph type ${graphType}`)
  if (windowFunction !== undefined) parts.push(`window function ${windowFunction}`)
  if (flipAxis !== undefined) parts.push(`its axis ${flipAxis ? 'flipped' : 'not flipped'}`)
  if (colorScale !== undefined) parts.push('that color scale')
  return parts.join(' and ')
}

/** Below this many bp per pixel igv.js draws dynseq's bases; above it, bars. */
const DYNSEQ_BP_PER_PIXEL = 2

/**
 * The note for a reply when a signal style was set other than as asked (ADR 0006): every
 * track already had it, so nothing changed, or dynseq that will not show at the zoom of
 * the view, whose finest `bpPerPixel` is given. Pure. Undefined when there is nothing to say.
 */
export function signalStyleNote(asked: SignalStyleAsk, changes: SignalStyleChange[], bpPerPixel: number): string | undefined {
  const names = listed(changes.map(({ name }) => name))
  const notes: string[] = []
  if (changes.length > 0 && changes.every(({ unchanged }) => unchanged)) notes.push(`${names} already had ${described(asked)}, so nothing changed.`)
  if (asked.graphType === 'dynseq' && changes.length > 0 && !(bpPerPixel < DYNSEQ_BP_PER_PIXEL)) {
    const one = changes.length === 1
    notes.push(
      `${names} ${one ? 'is' : 'are'} drawn as dynseq, which shows bases only below ${DYNSEQ_BP_PER_PIXEL} bp per pixel: until the view is zoomed in that far ${one ? 'it is' : 'they are'} drawn as bars.`,
    )
  }
  return notes.length > 0 ? notes.join(' ') : undefined
}

/** Whether a color scale `current`, as igv.js saves it, is `scale`. Pure. igv.js spells its own colors in its own ways. */
export function sameColorScale(current: Partial<ColorScale> | undefined, scale: ColorScale): boolean {
  if (!current || current.type !== scale.type) return false
  return (Object.keys(scale) as Array<keyof ColorScale>).every((key) => {
    const [was, is] = [current[key], scale[key]]
    if (was === is) return true
    if (typeof is !== 'string') return false
    try {
      return sameColor(was, trackColor(is))
    } catch {
      return false
    }
  })
}
